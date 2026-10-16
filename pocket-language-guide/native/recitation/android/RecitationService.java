package dev.vetr.pocketlanguageguide;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Binder;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

public class RecitationService extends Service {
    private static final String CHANNEL = "wanderwart-recitation";
    private static final int NOTIFICATION = 7214;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final List<Runnable> initialized = new ArrayList<>();
    Consumer<JSObject> listener;
    private TextToSpeech speech;
    private boolean speechReady;
    private String initializationError;
    private RecitationPlan plan;
    private int index = -1, audioIndex, serial;
    private String status = "stopped", error;
    private long remainingDelay, deadline, sequenceStarted;
    private boolean delaying;
    private Runnable advance;
    private MediaSession session;
    private AudioManager audio;
    private AudioFocusRequest focus;
    private PowerManager.WakeLock awake;
    private final BroadcastReceiver noisy = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) { pause(); }
    };
    public class LocalBinder extends Binder { RecitationService service() { return RecitationService.this; } }
    @Override public IBinder onBind(Intent intent) { return new LocalBinder(); }

    @Override public void onCreate() {
        super.onCreate();
        audio = (AudioManager) getSystemService(AUDIO_SERVICE);
        AudioAttributes attributes = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build();
        focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN).setAudioAttributes(attributes)
            .setWillPauseWhenDucked(true).setOnAudioFocusChangeListener((change) -> {
                if (change < 0) pause();
            }, main).build();
        awake = ((PowerManager) getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Wanderwart:recitation");
        awake.setReferenceCounted(false);
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(
            new NotificationChannel(CHANNEL, "Phrase playback", NotificationManager.IMPORTANCE_LOW));
        session = new MediaSession(this, "Wanderwart phrase playback");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { resume(); }
            @Override public void onPause() { pause(); }
            @Override public void onStop() { stop("stopped", null); }
        }, main);
        session.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(noisy, new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY), RECEIVER_NOT_EXPORTED);
        else registerReceiver(noisy, new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY));
        speech = new TextToSpeech(getApplicationContext(), (result) -> main.post(() -> {
            speechReady = result == TextToSpeech.SUCCESS;
            initializationError = speechReady ? null : "The local speech engine could not initialize";
            if (speechReady) speech.setAudioAttributes(attributes);
            for (Runnable action : new ArrayList<>(initialized)) action.run();
            initialized.clear();
        }));
        speech.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String id) {}
            @Override public void onDone(String id) { main.post(() -> { if (id.equals(Integer.toString(serial)) && status.equals("playing")) { if (advance != null) main.removeCallbacks(advance); audioIndex++; speakNext(); } }); }
            @Override public void onError(String id) { onError(id, TextToSpeech.ERROR); }
            @Override public void onError(String id, int code) { main.post(() -> { if (id.equals(Integer.toString(serial))) stop("error", "Speech playback failed (" + code + ")"); }); }
        });
        main.postDelayed(() -> {
            if (!speechReady && initializationError == null) {
                initializationError = "The local speech engine did not respond";
                for (Runnable action : new ArrayList<>(initialized)) action.run();
                initialized.clear();
            }
        }, 15000);
    }

    void ready(PluginCall call, Runnable action) {
        Runnable checked = () -> { if (initializationError != null) call.reject(initializationError); else action.run(); };
        if (speechReady || initializationError != null) checked.run(); else initialized.add(checked);
    }

    JSObject voices(String locale) {
        JSArray voices = new JSArray();
        if (speech.getVoices() != null) for (Voice voice : speech.getVoices()) {
            if (!RecitationPlan.local(voice) || (!locale.isEmpty() && !RecitationPlan.matches(locale, voice.getLocale().toLanguageTag()))) continue;
            JSObject row = new JSObject();
            row.put("id", voice.getName()); row.put("name", voice.getName()); row.put("lang", voice.getLocale().toLanguageTag()); row.put("offline", "local");
            voices.put(row);
        }
        JSObject result = new JSObject(); result.put("voices", voices); return result;
    }

    JSObject state() {
        JSObject result = new JSObject(); result.put("status", status); result.put("index", index);
        if (plan != null && index >= 0 && index < plan.steps.size()) result.put("id", plan.steps.get(index).id);
        if (error != null) result.put("error", error);
        return result;
    }
    private void emit() { updateMedia(); if (listener != null) listener.accept(state()); }

    void start(PluginCall call) {
        final RecitationPlan next;
        try { next = new RecitationPlan(call.getData(), speech.getVoices()); }
        catch (Exception failure) { call.reject(failure.getMessage()); return; }
        stop("stopped", null);
        plan = next; index = 0; audioIndex = 0; sequenceStarted = SystemClock.elapsedRealtime();
        try {
            // Start while the Activity is visible, before requesting Android 15 audio focus.
            startForegroundService(new Intent(this, RecitationService.class).setAction("start"));
            foreground();
            if (audio.requestAudioFocus(focus) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) throw new Exception("Audio focus was refused; pause other audio and try again");
            awake.acquire(); session.setActive(true); status = "playing"; error = null; emit();
            speakNext(); call.resolve(state());
        } catch (Exception failure) { stop("error", failure.getMessage()); call.reject(failure.getMessage()); }
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? "stop" : intent.getAction();
        if ("pause".equals(action)) pause();
        else if ("resume".equals(action)) resume();
        else if ("stop".equals(action)) stop("stopped", null);
        return START_NOT_STICKY;
    }

    private void speakNext() {
        if (!status.equals("playing") || plan == null) return;
        if (SystemClock.elapsedRealtime() - sequenceStarted > RecitationPlan.MAX_DURATION_MS) { stop("error", "This playback sequence exceeds the six-hour limit"); return; }
        RecitationPlan.Step step = plan.steps.get(index);
        if (audioIndex < step.audio.size()) {
            RecitationPlan.Audio clip = step.audio.get(audioIndex);
            if (speech.setVoice(clip.voice) != TextToSpeech.SUCCESS || speech.setSpeechRate(clip.rate) != TextToSpeech.SUCCESS) {
                stop("error", "The selected local voice or speech rate is unavailable"); return;
            }
            int requested = ++serial;
            if (speech.speak(clip.text, TextToSpeech.QUEUE_FLUSH, null, Integer.toString(requested)) != TextToSpeech.SUCCESS) {
                stop("error", "The speech engine rejected this phrase"); return;
            }
            // Engines that never deliver completion must not hold the service forever.
            advance = () -> { if (serial == requested && status.equals("playing")) stop("error", "The speech engine stopped responding"); };
            main.postDelayed(advance, 300000);
        } else scheduleDelay(step.delayMs);
    }

    private void scheduleDelay(long delay) {
        if (advance != null) main.removeCallbacks(advance);
        delaying = true; remainingDelay = delay; deadline = SystemClock.uptimeMillis() + delay;
        advance = () -> {
            delaying = false; remainingDelay = 0; audioIndex = 0; index++;
            if (index >= plan.steps.size()) {
                if (!plan.repeat) { index = plan.steps.size() - 1; stop("ended", null); return; }
                index = 0; sequenceStarted = SystemClock.elapsedRealtime();
            }
            emit(); speakNext();
        };
        main.postDelayed(advance, delay);
    }

    void pause() {
        if (!status.equals("playing")) return;
        if (delaying) remainingDelay = Math.max(0, deadline - SystemClock.uptimeMillis());
        if (advance != null) main.removeCallbacks(advance);
        serial++; speech.stop(); status = "paused";
        if (awake.isHeld()) awake.release();
        audio.abandonAudioFocusRequest(focus); emit();
    }
    void resume() {
        if (!status.equals("paused") || plan == null) return;
        try {
            foreground();
            if (audio.requestAudioFocus(focus) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) throw new Exception("Audio focus was refused");
            awake.acquire(); status = "playing"; emit();
            if (delaying) scheduleDelay(remainingDelay); else speakNext();
        } catch (Exception failure) { stop("error", failure.getMessage()); }
    }
    void stop(String next, String reason) {
        serial++;
        if (advance != null) main.removeCallbacks(advance);
        advance = null; delaying = false; remainingDelay = 0;
        if (speech != null) speech.stop();
        if (awake != null && awake.isHeld()) awake.release();
        if (audio != null && focus != null) audio.abandonAudioFocusRequest(focus);
        status = next; error = reason; emit();
        if (session != null) session.setActive(false);
        stopForeground(STOP_FOREGROUND_REMOVE); stopSelf();
    }

    private PendingIntent command(String action) {
        return PendingIntent.getService(this, action.hashCode(), new Intent(this, RecitationService.class).setAction(action), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
    private Notification notification() {
        boolean playing = status.equals("playing");
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent open = PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Builder(this, CHANNEL).setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle("Wanderwart phrase playback").setContentText(playing ? "Playing · phrase " + (index + 1) : "Paused")
            .setContentIntent(open).setOnlyAlertOnce(true).setOngoing(playing).setCategory(Notification.CATEGORY_TRANSPORT)
            .addAction(new Notification.Action.Builder(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                playing ? "Pause" : "Resume", command(playing ? "pause" : "resume")).build())
            .addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel, "Stop", command("stop")).build())
            .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0, 1)).build();
    }
    private void foreground() {
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        else startForeground(NOTIFICATION, notification());
    }
    private void updateMedia() {
        if (session == null) return;
        boolean playing = status.equals("playing");
        session.setPlaybackState(new PlaybackState.Builder().setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_STOP | PlaybackState.ACTION_PLAY_PAUSE)
            .setState(playing ? PlaybackState.STATE_PLAYING : status.equals("paused") ? PlaybackState.STATE_PAUSED : PlaybackState.STATE_STOPPED, PlaybackState.PLAYBACK_POSITION_UNKNOWN, playing ? 1 : 0).build());
        session.setMetadata(new MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE, "Wanderwart phrase playback")
            .putString(MediaMetadata.METADATA_KEY_ARTIST, "Phrase " + (index + 1)).build());
        if (playing || status.equals("paused")) ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(NOTIFICATION, notification());
    }
    @Override public void onDestroy() {
        stop("stopped", null);
        unregisterReceiver(noisy); session.release(); speech.shutdown();
        initialized.clear(); main.removeCallbacksAndMessages(null); super.onDestroy();
    }
}
