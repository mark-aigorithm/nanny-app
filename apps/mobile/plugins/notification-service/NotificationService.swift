import UserNotifications

/// Adds the announcement image to an iOS push banner. iOS shows a push's text
/// on its own; a picture appears only when an extension like this one
/// downloads it and attaches it before the banner is shown. The backend marks
/// pushes with an image `mutable-content` and FCM puts the URL in
/// `fcm_options.image`. Anything else is delivered unchanged.
class NotificationService: UNNotificationServiceExtension {
  private var contentHandler: ((UNNotificationContent) -> Void)?
  private var bestAttempt: UNMutableNotificationContent?

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    self.contentHandler = contentHandler
    bestAttempt = request.content.mutableCopy() as? UNMutableNotificationContent

    guard
      let content = bestAttempt,
      let options = request.content.userInfo["fcm_options"] as? [String: Any],
      let link = options["image"] as? String,
      let url = URL(string: link)
    else {
      contentHandler(request.content)
      return
    }

    URLSession.shared.downloadTask(with: url) { location, response, _ in
      if let location = location,
        let attachment = Self.attachment(from: location, mimeType: response?.mimeType)
      {
        content.attachments = [attachment]
      }
      contentHandler(content)
    }.resume()
  }

  /// iOS gives an extension about 30 seconds; if the download is still going,
  /// the banner goes out with its text alone.
  override func serviceExtensionTimeWillExpire() {
    if let contentHandler = contentHandler, let bestAttempt = bestAttempt {
      contentHandler(bestAttempt)
    }
  }

  /// The downloaded file, renamed with the extension iOS needs to read it.
  private static func attachment(from location: URL, mimeType: String?) -> UNNotificationAttachment? {
    let ext: String
    switch mimeType {
    case "image/png": ext = "png"
    case "image/gif": ext = "gif"
    default: ext = "jpg"
    }
    let file = URL(fileURLWithPath: NSTemporaryDirectory())
      .appendingPathComponent(UUID().uuidString)
      .appendingPathExtension(ext)
    do {
      try FileManager.default.moveItem(at: location, to: file)
      return try UNNotificationAttachment(identifier: "image", url: file)
    } catch {
      return nil
    }
  }
}
