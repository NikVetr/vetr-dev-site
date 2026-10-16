import Foundation
import AVFoundation
import MediaPlayer
import UIKit
import Capacitor

// Speech is rendered once into an AAC timeline, including the requested gaps.
// AVAudioPlayer owns that timeline when UIKit suspends JavaScript and timers.
@objc(BackgroundRecitationPlugin)
public final class BackgroundRecitationPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BackgroundRecitationPlugin"
    public let jsName = "BackgroundRecitation"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getVoices", returnType: CAPPluginReturnPromise)
    ]
    public override func load() {
        RecitationEngine.shared.onState = { [weak self] state in self?.notifyListeners("state", data: state) }
    }
    @objc func getVoices(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let locale = call.getString("locale") ?? ""
            call.resolve(["voices": RecitationEngine.voices().filter { locale.isEmpty || RecitationEngine.matches(locale, $0.language) }
                .map { ["id": $0.identifier, "name": $0.name, "lang": $0.language, "offline": "local"] }])
        }
    }
    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async { RecitationEngine.shared.start(call) }
    }
    @objc func pause(_ call: CAPPluginCall) {
        DispatchQueue.main.async { RecitationEngine.shared.pause(); call.resolve(RecitationEngine.shared.state()) }
    }
    @objc func resume(_ call: CAPPluginCall) {
        DispatchQueue.main.async { RecitationEngine.shared.resume(); call.resolve(RecitationEngine.shared.state()) }
    }
    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async { RecitationEngine.shared.stop(); call.resolve(RecitationEngine.shared.state()) }
    }
    @objc func getState(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(RecitationEngine.shared.state()) }
    }
}

private struct RecitationFailure: LocalizedError {
    let errorDescription: String?
    init(_ message: String) { errorDescription = message }
}
private struct SpokenPart {
    let text: String
    let voice: AVSpeechSynthesisVoice
    let rate: Float
}
private struct PlaybackStep {
    let id: String
    let audio: [SpokenPart]
    let delay: Double
}

private final class RecitationEngine: NSObject, AVAudioPlayerDelegate {
    static let shared = RecitationEngine()
    private let synthesizer = AVSpeechSynthesizer()
    private let renderQueue = DispatchQueue(label: "dev.vetr.recitation.audio")
    private let format = AVAudioFormat(standardFormatWithSampleRate: 22050, channels: 1)!
    private var player: AVAudioPlayer?
    private var writer: AVAudioFile?
    private var fileURL: URL?
    private var generation = 0
    private var steps: [PlaybackStep] = []
    private var boundaries: [Double] = []
    private var frames: AVAudioFramePosition = 0
    private var renderIndex = 0
    private var partIndex = 0
    private var partFrames: AVAudioFramePosition = 0
    private var repeats = false
    private var status = "stopped"
    private var index = -1
    private var failure: String?
    private var startCall: CAPPluginCall?
    private var ticker: Timer?
    private var renderTimeout: DispatchWorkItem?
    var onState: (([String: Any]) -> Void)?

    override init() {
        super.init()
        // A process killed by the OS cannot run stop(); reclaim only our own
        // abandoned temporary tracks on the next process's first use.
        if let files = try? FileManager.default.contentsOfDirectory(at: FileManager.default.temporaryDirectory, includingPropertiesForKeys: nil) {
            for file in files where file.lastPathComponent.hasPrefix("wanderwart-recitation-") && file.pathExtension == "m4a" {
                try? FileManager.default.removeItem(at: file)
            }
        }
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(interrupted(_:)), name: AVAudioSession.interruptionNotification, object: nil)
        center.addObserver(self, selector: #selector(routeChanged(_:)), name: AVAudioSession.routeChangeNotification, object: nil)
        center.addObserver(self, selector: #selector(backgrounded), name: UIApplication.didEnterBackgroundNotification, object: nil)
        center.addObserver(self, selector: #selector(foregrounded), name: UIApplication.didBecomeActiveNotification, object: nil)
        let commands = MPRemoteCommandCenter.shared()
        commands.playCommand.addTarget { [weak self] _ in
            DispatchQueue.main.async { self?.resume() }; return .success
        }
        commands.pauseCommand.addTarget { [weak self] _ in
            DispatchQueue.main.async { self?.pause() }; return .success
        }
        commands.togglePlayPauseCommand.addTarget { [weak self] _ in
            DispatchQueue.main.async { if self?.status == "playing" { self?.pause() } else { self?.resume() } }; return .success
        }
        commands.stopCommand.addTarget { [weak self] _ in
            DispatchQueue.main.async { self?.stop() }; return .success
        }
    }

    static func canonical(_ tag: String) -> String {
        var parts = tag.replacingOccurrences(of: "_", with: "-").lowercased().split(separator: "-").map(String.init)
        guard !parts.isEmpty else { return "" }
        parts[0] = ["iw": "he", "in": "id", "jw": "jv", "tl": "fil"][parts[0]] ?? parts[0]
        return parts.joined(separator: "-")
    }
    static func matches(_ requested: String, _ actual: String) -> Bool {
        let need = canonical(requested), have = canonical(actual)
        if need.isEmpty || need == "tlh" || need == "qya" { return false }
        if ["zh-cn", "zh-hans", "cmn"].contains(need) {
            return ["zh-cn", "zh-sg", "zh-tw", "zh-hans", "cmn"].contains(have) || have.hasPrefix("cmn-")
        }
        return need.split(separator: "-").first == have.split(separator: "-").first
    }
    static func voices() -> [AVSpeechSynthesisVoice] {
        AVSpeechSynthesisVoice.speechVoices().filter { voice in
            if #available(iOS 17.0, *), voice.voiceTraits.contains(.isPersonalVoice) { return false }
            return true
        }
    }
    private func parse(_ call: CAPPluginCall) throws -> [PlaybackStep] {
        guard let raw = call.getArray("steps", JSObject.self), !raw.isEmpty, raw.count <= 10000 else {
            throw RecitationFailure("Choose between 1 and 10000 playback steps")
        }
        let voices = Self.voices()
        var characters = 0, spoken = 0
        var totalDelay = 0.0
        let result = try raw.map { step -> PlaybackStep in
            guard let id = step["id"] as? String, let delay = step["delayMs"] as? Double,
                  delay.isFinite, delay >= 0, delay <= 600000, delay.rounded() == delay,
                  let parts = step["audio"] as? [JSObject], parts.count <= 16 else {
                throw RecitationFailure("Each playback step needs an id, spoken parts and a delay from 0 to 600000 milliseconds")
            }
            totalDelay += delay / 1000
            let audio = try parts.map { part -> SpokenPart in
                guard let text = part["text"] as? String, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                      text.count <= 4000, let locale = part["locale"] as? String else {
                    throw RecitationFailure("A spoken phrase is empty or exceeds 4000 characters")
                }
                let id = part["voiceId"] as? String ?? ""
                let rate = part["rate"] as? Double ?? 1
                guard rate.isFinite, rate >= 0.25, rate <= 2 else { throw RecitationFailure("Speech rate must be between 0.25 and 2") }
                let matching = voices.filter { Self.matches(locale, $0.language) && (id.isEmpty || id == $0.identifier) }
                    .sorted { a, b in
                        let exactA = Self.canonical(a.language) == Self.canonical(locale)
                        let exactB = Self.canonical(b.language) == Self.canonical(locale)
                        return exactA == exactB ? a.identifier < b.identifier : exactA
                    }
                guard let voice = matching.first else { throw RecitationFailure("Download a local speech voice for \(locale); the selected voice is unavailable") }
                characters += text.count; spoken += 1
                return SpokenPart(text: text, voice: voice, rate: Float(rate))
            }
            return PlaybackStep(id: id, audio: audio, delay: delay / 1000)
        }
        guard spoken > 0 else { throw RecitationFailure("Background playback needs at least one spoken phrase") }
        guard characters <= 1000000, totalDelay <= 21600 else { throw RecitationFailure("Playback is limited to one million characters and six hours per sequence") }
        return result
    }

    func start(_ call: CAPPluginCall) {
        let requested: [PlaybackStep]
        do { requested = try parse(call) }
        catch { call.reject(error.localizedDescription); return }
        stop()
        generation += 1
        let token = generation
        steps = requested; repeats = call.getBool("repeat") ?? false
        boundaries = []; frames = 0; renderIndex = 0; partIndex = 0; index = 0
        status = "preparing"; startCall = call
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("wanderwart-recitation-\(UUID().uuidString).m4a")
        fileURL = url
        do {
            writer = try AVAudioFile(forWriting: url, settings: [AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: 22050, AVNumberOfChannelsKey: 1, AVEncoderBitRateKey: 64000],
                commonFormat: .pcmFormatFloat32, interleaved: false)
            try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: url.path)
            emit(); renderStep(token)
        } catch { fail(error.localizedDescription) }
    }

    private func renderStep(_ token: Int) {
        guard generation == token, status == "preparing" else { return }
        if renderIndex >= steps.count { finishRendering(token); return }
        if partIndex == 0 { boundaries.append(Double(frames) / format.sampleRate) }
        let step = steps[renderIndex]
        if partIndex >= step.audio.count {
            guard let file = writer else { fail("The temporary audio file was closed"); return }
            let silence = step.delay
            renderQueue.async { [weak self] in
                guard let self = self else { return }
                do {
                    let count = try self.writeSilence(silence, to: file)
                    DispatchQueue.main.async {
                        guard self.generation == token else { return }
                        self.frames += count; self.renderIndex += 1; self.partIndex = 0
                        self.emit(); self.renderStep(token)
                    }
                } catch { DispatchQueue.main.async { if self.generation == token { self.fail(error.localizedDescription) } } }
            }
            return
        }
        let part = step.audio[partIndex]
        partFrames = 0
        let utterance = AVSpeechUtterance(string: part.text)
        utterance.voice = part.voice
        utterance.rate = min(AVSpeechUtteranceMaximumSpeechRate, max(AVSpeechUtteranceMinimumSpeechRate, AVSpeechUtteranceDefaultSpeechRate * part.rate))
        let timeout = DispatchWorkItem { [weak self] in if self?.generation == token { self?.fail("The speech engine did not finish preparing this phrase") } }
        renderTimeout?.cancel(); renderTimeout = timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + 300, execute: timeout)
        guard let file = writer else { fail("The temporary audio file was closed"); return }
        synthesizer.write(utterance) { [weak self, weak file] audio in
            guard let self = self, let buffer = audio as? AVAudioPCMBuffer else { return }
            self.renderQueue.async {
                do {
                    guard let file = file else { return }
                    let count = buffer.frameLength == 0 ? AVAudioFramePosition(0) : try self.writeBuffer(buffer, to: file)
                    DispatchQueue.main.async {
                        guard self.generation == token, self.status == "preparing" else { return }
                        self.frames += count
                        self.partFrames += count
                        if buffer.frameLength == 0 {
                            guard self.partFrames > 0 else { self.fail("The selected speech voice produced no audio"); return }
                            self.renderTimeout?.cancel(); self.partIndex += 1; self.renderStep(token)
                        }
                    }
                } catch { DispatchQueue.main.async { if self.generation == token { self.fail(error.localizedDescription) } } }
            }
        }
    }

    private func writeBuffer(_ input: AVAudioPCMBuffer, to file: AVAudioFile) throws -> AVAudioFramePosition {
        guard let converter = AVAudioConverter(from: input.format, to: format),
              let output = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(ceil(Double(input.frameLength) * format.sampleRate / input.format.sampleRate)) + 64) else {
            throw RecitationFailure("Could not convert speech to the playback audio format")
        }
        var supplied = false
        var error: NSError?
        let result = converter.convert(to: output, error: &error) { _, status in
            if supplied { status.pointee = .endOfStream; return nil }
            supplied = true; status.pointee = .haveData; return input
        }
        if let error = error { throw error }
        if result == .error { throw RecitationFailure("Speech audio conversion failed") }
        if file.length + AVAudioFramePosition(output.frameLength) > AVAudioFramePosition(21600 * format.sampleRate) {
            throw RecitationFailure("The generated playback sequence exceeds six hours; choose fewer phrases or shorter delays")
        }
        try file.write(from: output)
        return AVAudioFramePosition(output.frameLength)
    }
    private func writeSilence(_ seconds: Double, to file: AVAudioFile) throws -> AVAudioFramePosition {
        let count = AVAudioFramePosition((seconds * format.sampleRate).rounded())
        if file.length + count > AVAudioFramePosition(21600 * format.sampleRate) { throw RecitationFailure("The playback sequence exceeds six hours") }
        guard let silence = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 4096), let channel = silence.floatChannelData?[0] else {
            throw RecitationFailure("Could not allocate an audio pause")
        }
        memset(channel, 0, 4096 * MemoryLayout<Float>.size)
        var left = count
        while left > 0 {
            silence.frameLength = AVAudioFrameCount(min(left, 4096))
            try file.write(from: silence); left -= AVAudioFramePosition(silence.frameLength)
        }
        return count
    }
    private func finishRendering(_ token: Int) {
        renderTimeout?.cancel(); writer = nil
        // The final buffer callback must release its file reference so AAC's
        // container is finalized before AVAudioPlayer opens it.
        renderQueue.async { [weak self] in
            DispatchQueue.main.async {
                guard let self = self, self.generation == token else { return }
                self.openPlayer()
            }
        }
    }
    private func openPlayer() {
        guard let url = fileURL else { fail("The playback file is missing"); return }
        do {
            guard frames > 0 else { throw RecitationFailure("The speech engine produced no audio") }
            let size = (try FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.int64Value ?? 0
            guard size > 0, size <= 200 * 1024 * 1024 else { throw RecitationFailure("The generated playback audio exceeds 200 MB; choose fewer phrases") }
            let player = try AVAudioPlayer(contentsOf: url)
            player.delegate = self; player.numberOfLoops = repeats ? -1 : 0
            self.player = player
            try activateAudio()
            guard player.prepareToPlay(), player.play() else { throw RecitationFailure("The prepared audio could not start playing") }
            status = "playing"; index = 0
            ticker = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in self?.syncIndex() }
            emit(); startCall?.resolve(state()); startCall = nil
        } catch { fail(error.localizedDescription) }
    }
    private func activateAudio() throws {
        let audio = AVAudioSession.sharedInstance()
        try audio.setCategory(.playback, mode: .spokenAudio)
        try audio.setActive(true)
        UIApplication.shared.beginReceivingRemoteControlEvents()
    }
    private func syncIndex() {
        guard let player = player, !boundaries.isEmpty else { return }
        let next = boundaries.lastIndex(where: { $0 <= player.currentTime }) ?? 0
        if next != index { index = next; emit() }
    }
    func state() -> [String: Any] {
        syncIndex()
        var result: [String: Any] = ["status": status, "index": index]
        if steps.indices.contains(index) { result["id"] = steps[index].id }
        if let failure = failure { result["error"] = failure }
        if status == "preparing" { result["prepared"] = renderIndex; result["total"] = steps.count }
        return result
    }
    private func emit() {
        nowPlaying()
        // No syncIndex here: it already calls emit when the active phase changes.
        var result: [String: Any] = ["status": status, "index": index]
        if steps.indices.contains(index) { result["id"] = steps[index].id }
        if let failure = failure { result["error"] = failure }
        if status == "preparing" { result["prepared"] = renderIndex; result["total"] = steps.count }
        onState?(result)
    }
    func pause() {
        guard status == "playing" else { return }
        player?.pause(); status = "paused"; emit()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
    func resume() {
        guard status == "paused", let player = player else { return }
        do {
            try activateAudio()
            guard player.play() else { throw RecitationFailure("Audio playback could not resume") }
            status = "playing"; emit()
        } catch { fail(error.localizedDescription) }
    }
    func stop() {
        generation += 1
        renderTimeout?.cancel(); renderTimeout = nil
        synthesizer.stopSpeaking(at: .immediate)
        player?.stop(); player = nil
        ticker?.invalidate(); ticker = nil
        startCall?.reject("Playback preparation was cancelled"); startCall = nil
        let oldWriter = writer, oldURL = fileURL
        writer = nil; fileURL = nil
        // Wait for queued buffer writes before closing and deleting their own file.
        renderQueue.async {
            _ = oldWriter
            if let url = oldURL { try? FileManager.default.removeItem(at: url) }
        }
        status = "stopped"; failure = nil; index = -1
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        UIApplication.shared.endReceivingRemoteControlEvents()
        emit()
    }
    private func fail(_ message: String) {
        let waiting = startCall; startCall = nil
        stop(); status = "error"; failure = message; emit(); waiting?.reject(message)
    }
    private func nowPlaying() {
        guard status == "playing" || status == "paused", let player = player else { return }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = [
            MPMediaItemPropertyTitle: "Wanderwart phrase playback",
            MPMediaItemPropertyArtist: "Phrase \(index + 1)",
            MPMediaItemPropertyPlaybackDuration: player.duration,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: player.currentTime,
            MPNowPlayingInfoPropertyPlaybackRate: status == "playing" ? 1.0 : 0.0
        ]
    }
    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        if !flag { fail("Audio playback ended unexpectedly"); return }
        let last = max(0, steps.count - 1)
        stop(); status = "ended"; index = last; emit()
    }
    func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) { fail(error?.localizedDescription ?? "Audio decoding failed") }
    @objc private func interrupted(_ notification: Notification) {
        if notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt == AVAudioSession.InterruptionType.began.rawValue { pause() }
    }
    @objc private func routeChanged(_ notification: Notification) {
        if notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue { pause() }
    }
    @objc private func backgrounded() {
        if status == "preparing" { fail("Keep Wanderwart open while the playback audio is being prepared") }
    }
    @objc private func foregrounded() { syncIndex(); emit() }
}
