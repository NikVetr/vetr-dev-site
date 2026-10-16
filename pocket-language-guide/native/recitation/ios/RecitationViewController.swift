import Capacitor

final class RecitationViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(BackgroundRecitationPlugin())
    }
}
