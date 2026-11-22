import Capacitor
import Photos

@objc(PhotoLibraryPlugin)
public final class PhotoLibraryPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PhotoLibraryPlugin"
    public let jsName = "PhotoLibrary"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "savePNG", returnType: CAPPluginReturnPromise)]

    @objc func savePNG(_ call: CAPPluginCall) {
        guard let encoded = call.getString("data"), let data = Data(base64Encoded: encoded),
              data.starts(with: [137, 80, 78, 71, 13, 10, 26, 10]) else {
            call.reject("The exported PNG could not be read.")
            return
        }
        let name = call.getString("name")
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            guard status == .authorized || status == .limited else {
                call.reject("Allow Wanderwart to add photos in Settings to save this image.")
                return
            }
            PHPhotoLibrary.shared().performChanges {
                let options = PHAssetResourceCreationOptions()
                options.originalFilename = name
                PHAssetCreationRequest.forAsset().addResource(with: .photo, data: data, options: options)
            } completionHandler: { saved, error in
                if saved { call.resolve() }
                else { call.reject(error?.localizedDescription ?? "Photos could not save this image.") }
            }
        }
    }
}
