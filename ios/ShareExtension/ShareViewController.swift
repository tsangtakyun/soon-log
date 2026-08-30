/*!
 * Native module created for Expo Share Intent (https://github.com/achorein/expo-share-intent)
 * author: achorein (https://github.com/achorein)
 * inspired by :
 *  - https://ajith-ab.github.io/react-native-receive-sharing-intent/docs/ios#create-share-extension
 */
import MobileCoreServices
import LinkPresentation
import Photos
import Social
import UIKit
import Vision

class ShareViewController: UIViewController {
  let hostAppGroupIdentifier = "group.com.theirstudio.sooncreatorlog.shared"
  let shareProtocol = "soonegg"
  let sharedKey = "soonlogShareKey"
  var sharedMedia: [SharedMediaFile] = []
  var sharedWebUrl: [WebUrl] = []
  var sharedText: [String] = []
  let imageContentType: String = UTType.image.identifier
  let videoContentType: String = UTType.movie.identifier
  let textContentType: String = UTType.text.identifier
  let plainTextContentTypes: [String] = [
    UTType.text.identifier,
    "public.plain-text",
    "public.utf8-plain-text",
    "public.text"
  ]
  let urlContentType: String = UTType.url.identifier
  let propertyListType: String = UTType.propertyList.identifier
  let fileURLType: String = UTType.fileURL.identifier
  let pkpassContentType: String = "com.apple.pkpass"
  let pdfContentType: String = UTType.pdf.identifier
  private var didStartProcessing = false
  private var pendingRedirectType: RedirectType?
  private var expectedAttachmentCount = 0
  private var processedAttachmentIndexes = Set<Int>()
  private var didPrepareSharedPayload = false
  private let titleLabel = UILabel()
  private let statusLabel = UILabel()
  private let saveButton = UIButton(type: .system)
  private let linkPreviewLabel = UILabel()
  private var boardCheckmarks: [String: UIImageView] = [:]
  private var selectedBoard = "topic-library"
  private var extensionContentText: String?
  private var currentShareWebUrlSet = Set<String>()

  override func viewDidLoad() {
    super.viewDidLoad()
    setupMinimalSaveUI()
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    guard !didStartProcessing else { return }
    didStartProcessing = true
    Task {
      guard let extensionContext = self.extensionContext,
        let content = extensionContext.inputItems.first as? NSExtensionItem,
        let attachments = content.attachments
      else {
        dismissWithError(message: "No content found")
        return
      }
      self.captureExtensionContentText(content)
      self.debugLogSharePayload(content: content, attachments: attachments)
      self.expectedAttachmentCount = attachments.count
      for (index, attachment) in (attachments).enumerated() {
        if attachment.hasItemConformingToTypeIdentifier(imageContentType) {
          await handleImages(content: content, attachment: attachment, index: index)
        } else if attachment.hasItemConformingToTypeIdentifier(videoContentType) {
          await handleVideos(content: content, attachment: attachment, index: index)
        } else if attachment.hasItemConformingToTypeIdentifier(fileURLType) {
          await handleFiles(content: content, attachment: attachment, index: index)
        } else if attachment.hasItemConformingToTypeIdentifier(pkpassContentType) {
          await handlePkPass(content: content, attachment: attachment, index: index)
        } else if attachment.hasItemConformingToTypeIdentifier(pdfContentType) {
          await handlePdf(content: content, attachment: attachment, index: index)
        } else if attachment.hasItemConformingToTypeIdentifier(propertyListType) {
          await handlePrepocessing(content: content, attachment: attachment, index: index)
        } else if attachment.hasItemConformingToTypeIdentifier(urlContentType) {
          await handleUrl(content: content, attachment: attachment, index: index)
        } else if attachment.hasItemConformingToTypeIdentifier(textContentType) {
          await handleText(content: content, attachment: attachment, index: index)
        } else {
          NSLog("[ERROR] content type not handle !\(String(describing: content))")
          await MainActor.run {
            self.markAttachmentProcessed(index: index)
          }
        }
      }
    }
  }

  private func captureExtensionContentText(_ content: NSExtensionItem) {
    let title = content.attributedTitle?.string
    let text = content.attributedContentText?.string
    extensionContentText = firstNonEmpty(text, title)

    if let extensionContentText {
      NSLog("[ShareExtension] extension text captured=\(debugSnippet(extensionContentText))")
    }
  }

  private func debugLogSharePayload(content: NSExtensionItem, attachments: [NSItemProvider]) {
    NSLog("[ShareExtension] attributedTitle=\(debugSnippet(content.attributedTitle?.string))")
    NSLog("[ShareExtension] attributedContentText=\(debugSnippet(content.attributedContentText?.string))")
    if let userInfo = content.userInfo {
      NSLog("[ShareExtension] userInfo keys=\(userInfo.keys.map { String(describing: $0) }.joined(separator: ", "))")
    }
    for (index, attachment) in attachments.enumerated() {
      NSLog("[ShareExtension] attachment[\(index)] types=\(attachment.registeredTypeIdentifiers.joined(separator: ", "))")
    }
  }

  private func debugSnippet(_ value: String?, limit: Int = 700) -> String {
    guard let value else { return "(nil)" }
    let cleaned = value.replacingOccurrences(of: "\n", with: "\\n")
    if cleaned.count <= limit {
      return cleaned
    }
    return String(cleaned.prefix(limit)) + "..."
  }

  private func loadTextPayload(from attachment: NSItemProvider) async -> String? {
    for typeIdentifier in plainTextContentTypes where attachment.hasItemConformingToTypeIdentifier(typeIdentifier) {
      do {
        let item = try await attachment.loadItem(forTypeIdentifier: typeIdentifier)
        if let string = item as? String, let normalized = normalizedSharedText(string) {
          return normalized
        }
        if let string = item as? NSString, let normalized = normalizedSharedText(string as String) {
          return normalized
        }
        if let attributed = item as? NSAttributedString, let normalized = normalizedSharedText(attributed.string) {
          return normalized
        }
      } catch {
        NSLog("[ShareExtension] cannot load text payload for \(typeIdentifier): \(error.localizedDescription)")
      }
    }

    return nil
  }

  private func normalizedSharedText(_ value: String?) -> String? {
    guard let value else { return nil }
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty { return nil }
    if trimmed.range(of: #"^https?://\S+$"#, options: .regularExpression) != nil { return nil }
    if trimmed.caseInsensitiveCompare("Instagram") == .orderedSame { return nil }
    return trimmed
  }

  @MainActor
  private func appendSharedText(_ value: String) {
    guard let normalized = normalizedSharedText(value) else { return }
    if !sharedText.contains(normalized) {
      sharedText.append(normalized)
    }
  }

  private func handleText(content: NSExtensionItem, attachment: NSItemProvider, index: Int) async {
    Task.detached {
      if let item = await self.loadTextPayload(from: attachment) {
        Task { @MainActor in

          NSLog("[ShareExtension] loaded text=\(self.debugSnippet(item))")
          self.appendSharedText(item)
          self.markAttachmentProcessed(index: index)

        }
      } else {
        NSLog("[ERROR] Cannot load text content !\(String(describing: content))")
        await MainActor.run {
          self.markAttachmentProcessed(index: index)
        }
      }
    }
  }

  private func handleUrl(content: NSExtensionItem, attachment: NSItemProvider, index: Int) async {
    Task.detached {
      if let item = try! await attachment.loadItem(forTypeIdentifier: self.urlContentType) as? URL {
        NSLog("[ShareExtension] loaded url=\(item.absoluteString)")
        let previewImage = await self.fetchLinkPreviewImage(for: item)
        let payloadText = await self.loadTextPayload(from: attachment)
        Task { @MainActor in

          if let payloadText {
            self.appendSharedText(payloadText)
          }
          self.sharedWebUrl.append(WebUrl(url: item.absoluteString, meta: self.metaWithSelectedBoard(previewImage: previewImage)))
          self.linkPreviewLabel.text = item.absoluteString
          self.markAttachmentProcessed(index: index)

        }
      } else {
        NSLog("[ERROR] Cannot load url content !\(String(describing: content))")
        await MainActor.run {
          self.markAttachmentProcessed(index: index)
        }
      }
    }
  }

  private func handlePrepocessing(content: NSExtensionItem, attachment: NSItemProvider, index: Int)
    async
  {
    Task.detached {
      if let item = try! await attachment.loadItem(
        forTypeIdentifier: self.propertyListType, options: nil)
        as? NSDictionary
      {
        if let results = item[NSExtensionJavaScriptPreprocessingResultsKey] as? NSDictionary {
          NSLog(
            "[DEBUG] NSExtensionJavaScriptPreprocessingResultsKey \(String(describing: results))"
          )
          NSLog("[ShareExtension] preprocessing keys=\(results.allKeys.map { String(describing: $0) }.joined(separator: ", "))")
          let baseURI = results["baseURI"] as! String
          NSLog("[ShareExtension] preprocessing baseURI=\(baseURI)")
          if let meta = results["meta"] as? String {
            NSLog("[ShareExtension] preprocessing meta=\(self.debugSnippet(meta))")
          }
          var previewImage: String? = nil
          if let url = URL(string: baseURI) {
            previewImage = await self.fetchLinkPreviewImage(for: url)
          }

          Task { @MainActor in
            self.sharedWebUrl.append(
              WebUrl(url: baseURI, meta: self.metaWithSelectedBoard(existingMeta: results["meta"] as? String, previewImage: previewImage)))
            self.linkPreviewLabel.text = baseURI
            self.markAttachmentProcessed(index: index)
          }
        } else {
          NSLog("[ERROR] Cannot load preprocessing results !\(String(describing: content))")
          await MainActor.run {
            self.markAttachmentProcessed(index: index)
          }
        }
      } else {
        NSLog("[ERROR] Cannot load preprocessing content !\(String(describing: content))")
        await MainActor.run {
          self.markAttachmentProcessed(index: index)
        }
      }
    }
  }

  private func handlePkPass(content: NSExtensionItem, attachment: NSItemProvider, index: Int) async {
      Task.detached {
          NSLog("[DEBUG] Attempting to handle pkpass file for item \(index)")
          NSLog("[DEBUG] Available type identifiers: \(attachment.registeredTypeIdentifiers)")
  
          do {
              if let url = try await attachment.loadItem(forTypeIdentifier: self.pkpassContentType) as? URL {
                  NSLog("[DEBUG] Successfully loaded pkpass as URL: \(url.absoluteString)")
                  NSLog("[DEBUG] URL path: \(url.path), isFileURL: \(url.isFileURL)")
                  await self.handleFileURL(content: content, url: url, index: index)
  
              } else if let data = try await attachment.loadItem(forTypeIdentifier: self.pkpassContentType) as? Data {
                  NSLog("[DEBUG] Successfully loaded pkpass as Data, size: \(data.count) bytes")
                  let tempFileName = UUID().uuidString + ".pkpass"
                  let tempFileURL = FileManager.default.temporaryDirectory.appendingPathComponent(tempFileName)
  
                  // Writing data to a file is I/O, keep it off the main thread.
                  try data.write(to: tempFileURL)
                  NSLog("[DEBUG] Saved pkpass data to temporary file: \(tempFileURL.path)")
  
                  // Handle the newly created temporary file URL.
                  await self.handleFileURL(content: content, url: tempFileURL, index: index)
  
              } else {
                  // If it's neither URL nor Data, it's unexpected for pkpassContentType.
                  NSLog("[ERROR] Cannot load pkpass content: Item was neither URL nor Data for type \(self.pkpassContentType). Attachment: \(attachment)")
                  // Ensure dismissWithError runs on the main thread if it interacts with UI
                  Task { @MainActor in
                      self.markAttachmentProcessed(index: index)
                  }
              }
          } catch {
              // Catch errors from loadItem or data.write
              NSLog("[ERROR] Exception when handling pkpass: \(error.localizedDescription)")
              // Ensure dismissWithError runs on the main thread if it interacts with UI
              Task { @MainActor in
                  self.markAttachmentProcessed(index: index)
              }
          }
      }
  }


  private func handleImages(content: NSExtensionItem, attachment: NSItemProvider, index: Int) async
  {
    Task.detached {
      if let item = try? await attachment.loadItem(forTypeIdentifier: self.imageContentType) {
        Task { @MainActor in

          var url: URL? = nil
          if let dataURL = item as? URL {
            url = dataURL
          } else if let imageData = item as? UIImage {
            url = self.saveScreenshot(imageData)
          }

          guard let resolvedUrl = url else {
            self.markAttachmentProcessed(index: index)
            return
          }

          var pixelWidth: Int? = nil
          var pixelHeight: Int? = nil
          if let imageSource = CGImageSourceCreateWithURL(resolvedUrl as CFURL, nil) {
            if let imageProperties = CGImageSourceCopyPropertiesAtIndex(imageSource, 0, nil)
              as Dictionary?
            {
              pixelWidth = imageProperties[kCGImagePropertyPixelWidth] as? Int
              pixelHeight = imageProperties[kCGImagePropertyPixelHeight] as? Int
              // Check orientation and flip size if required
              if let orientationNumber = imageProperties[kCGImagePropertyOrientation] as! CFNumber?
              {
                var orientation: Int = 0
                CFNumberGetValue(orientationNumber, .intType, &orientation)
                if orientation > 4 {
                  let temp: Int? = pixelWidth
                  pixelWidth = pixelHeight
                  pixelHeight = temp
                }
              }
            }
          }

          // Always copy
          let fileName = self.getFileName(from: resolvedUrl, type: .image)
          let fileExtension = self.getExtension(from: resolvedUrl, type: .image)
          let fileSize = self.getFileSize(from: resolvedUrl)
          let mimeType = resolvedUrl.mimeType(ext: fileExtension)
          let newName = "\(UUID().uuidString).\(fileExtension)"
          let newPath = FileManager.default
            .containerURL(
              forSecurityApplicationGroupIdentifier: self.hostAppGroupIdentifier)!
            .appendingPathComponent(newName)
          let copied = self.copyFile(at: resolvedUrl, to: newPath)
          if copied {
            self.sharedMedia.append(
              SharedMediaFile(
                path: newPath.absoluteString, thumbnail: nil, fileName: fileName,
                fileSize: fileSize, width: pixelWidth, height: pixelHeight, duration: nil,
                mimeType: mimeType, type: .image))
          }

          self.markAttachmentProcessed(index: index)

        }
      } else {
        NSLog("[ERROR] Cannot load image content !\(String(describing: content))")
        await MainActor.run {
          self.markAttachmentProcessed(index: index)
        }
      }
    }
  }

  private func documentDirectoryPath() -> URL? {
    let path = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)
    return path.first
  }

  private func saveScreenshot(_ image: UIImage) -> URL? {
    var screenshotURL: URL? = nil
    if let screenshotData = image.pngData(),
      let screenshotPath = documentDirectoryPath()?.appendingPathComponent("screenshot.png")
    {
      try? screenshotData.write(to: screenshotPath)
      screenshotURL = screenshotPath
    }
    return screenshotURL
  }

  private func handleVideos(content: NSExtensionItem, attachment: NSItemProvider, index: Int) async
  {
    Task.detached {
      if let url = try? await attachment.loadItem(forTypeIdentifier: self.videoContentType) as? URL
      {
        Task { @MainActor in

          // Always copy
          let fileName = self.getFileName(from: url, type: .video)
          let fileExtension = self.getExtension(from: url, type: .video)
          let fileSize = self.getFileSize(from: url)
          let mimeType = url.mimeType(ext: fileExtension)
          let newName = "\(UUID().uuidString).\(fileExtension)"
          let newPath = FileManager.default
            .containerURL(
              forSecurityApplicationGroupIdentifier: self.hostAppGroupIdentifier)!
            .appendingPathComponent(newName)
          let copied = self.copyFile(at: url, to: newPath)
          if copied {
            if let sharedFile = self.getSharedMediaFile(
              forVideo: newPath, fileName: fileName, fileSize: fileSize, mimeType: mimeType)
            {
              self.sharedMedia.append(sharedFile)
            }
          }

          self.markAttachmentProcessed(index: index)

        }
      } else {
        NSLog("[ERROR] Cannot load video content !\(String(describing: content))")
        await MainActor.run {
          self.markAttachmentProcessed(index: index)
        }
      }
    }
  }

  private func handlePdf(content: NSExtensionItem, attachment: NSItemProvider, index: Int) async {
    Task.detached {
      if let url = try? await attachment.loadItem(forTypeIdentifier: self.pdfContentType) as? URL {
        Task { @MainActor in

          await self.handleFileURL(content: content, url: url, index: index)

        }
      } else {
        NSLog("[ERROR] Cannot load pdf content !\(String(describing: content))")
        await MainActor.run {
          self.markAttachmentProcessed(index: index)
        }
      }
    }
  }

  private func handleFiles(content: NSExtensionItem, attachment: NSItemProvider, index: Int) async {
    Task.detached {
      if let url = try? await attachment.loadItem(forTypeIdentifier: self.fileURLType) as? URL {
        Task { @MainActor in

          await self.handleFileURL(content: content, url: url, index: index)

        }
      } else {
        NSLog("[ERROR] Cannot load file content !\(String(describing: content))")
        await MainActor.run {
          self.markAttachmentProcessed(index: index)
        }
      }
    }
  }

  private func handleFileURL(content: NSExtensionItem, url: URL, index: Int) async {
    // Always copy
    let fileName = self.getFileName(from: url, type: .file)
    let fileExtension = self.getExtension(from: url, type: .file)
    let fileSize = self.getFileSize(from: url)
    let mimeType = url.mimeType(ext: fileExtension)
    let newName = "\(UUID().uuidString).\(fileExtension)"
    let newPath = FileManager.default
      .containerURL(
        forSecurityApplicationGroupIdentifier: self.hostAppGroupIdentifier)!
      .appendingPathComponent(newName)
    let copied = self.copyFile(at: url, to: newPath)
    if copied {
      self.sharedMedia.append(
        SharedMediaFile(
          path: newPath.absoluteString, thumbnail: nil, fileName: fileName,
          fileSize: fileSize, width: nil, height: nil, duration: nil, mimeType: mimeType,
          type: .file))
    }

    self.markAttachmentProcessed(index: index)
  }

  @MainActor
  private func markAttachmentProcessed(index: Int) {
    processedAttachmentIndexes.insert(index)
    guard expectedAttachmentCount > 0,
      processedAttachmentIndexes.count >= expectedAttachmentCount
    else {
      return
    }

    prepareSharedPayload()
  }

  @MainActor
  private func prepareSharedPayload() {
    guard !didPrepareSharedPayload else { return }
    didPrepareSharedPayload = true

    let userDefaults = UserDefaults(suiteName: hostAppGroupIdentifier)

    if !sharedWebUrl.isEmpty {
      sharedWebUrl = sharedWebUrl.map {
        WebUrl(
          url: $0.url,
          meta: metaWithSelectedBoard(existingMeta: $0.meta, previewImage: bestPreviewImage())
        )
      }
      currentShareWebUrlSet = Set(sharedWebUrl.map { normalizedUrl($0.url) }.filter { !$0.isEmpty })
      sharedWebUrl = mergeWithPendingWebUrls(sharedWebUrl, userDefaults: userDefaults)
      userDefaults?.set(toData(data: sharedWebUrl), forKey: sharedKey)
      userDefaults?.synchronize()
      if linkPreviewLabel.text?.isEmpty ?? true {
        linkPreviewLabel.text = sharedWebUrl.first?.url ?? ""
      }
      finishLoading(type: .weburl)
      return
    }

    if !sharedMedia.isEmpty {
      userDefaults?.set(toData(data: sharedMedia), forKey: sharedKey)
      userDefaults?.synchronize()
      finishLoading(type: sharedMedia.contains(where: { $0.type == .file }) ? .file : .media)
      return
    }

    if !sharedText.isEmpty {
      userDefaults?.set(sharedText, forKey: sharedKey)
      userDefaults?.synchronize()
      finishLoading(type: .text)
      return
    }

    dismissWithError(message: "Cannot load shared content.")
  }

  private func setupMinimalSaveUI() {
    view.backgroundColor = UIColor(red: 0.03, green: 0.04, blue: 0.03, alpha: 1.0)

    let header = UIView()
    header.translatesAutoresizingMaskIntoConstraints = false

    let cancelButton = UIButton(type: .system)
    cancelButton.setTitle("取消", for: .normal)
    cancelButton.setTitleColor(.systemBlue, for: .normal)
    cancelButton.titleLabel?.font = UIFont.systemFont(ofSize: 17, weight: .regular)
    cancelButton.addTarget(self, action: #selector(cancelShare), for: .touchUpInside)

    titleLabel.text = "分享到 EGG"
    titleLabel.textColor = .white
    titleLabel.font = UIFont.systemFont(ofSize: 18, weight: .semibold)
    titleLabel.textAlignment = .center

    cancelButton.translatesAutoresizingMaskIntoConstraints = false
    titleLabel.translatesAutoresizingMaskIntoConstraints = false
    header.addSubview(cancelButton)
    header.addSubview(titleLabel)

    let contentStack = UIStackView()
    contentStack.axis = .vertical
    contentStack.spacing = 14
    contentStack.translatesAutoresizingMaskIntoConstraints = false

    let topicLibraryRow = makeBoardRow(
      id: "topic-library",
      title: "題材靈感庫",
      subtitle: "儲存靈感，由 AI 自動整理分類",
      systemIcon: "lightbulb"
    )
    let replyCenterRow = makeBoardRow(
      id: "reply-center",
      title: "回覆中心",
      subtitle: "將客戶查詢或截圖帶入 AI 回覆",
      systemIcon: "bubble.left.and.bubble.right"
    )

    linkPreviewLabel.text = ""
    linkPreviewLabel.textColor = UIColor(white: 1, alpha: 0.45)
    linkPreviewLabel.font = UIFont.systemFont(ofSize: 13, weight: .regular)
    linkPreviewLabel.numberOfLines = 1

    saveButton.translatesAutoresizingMaskIntoConstraints = false
    saveButton.setTitle("繼續", for: .normal)
    saveButton.setTitleColor(.white, for: .normal)
    saveButton.titleLabel?.font = UIFont.systemFont(ofSize: 18, weight: .semibold)
    saveButton.backgroundColor = UIColor(red: 0.82, green: 0.31, blue: 0.49, alpha: 0.45)
    saveButton.layer.cornerRadius = 18
    saveButton.isEnabled = false
    saveButton.addTarget(self, action: #selector(saveToHostApp), for: .touchUpInside)

    statusLabel.text = "讀取分享內容..."
    statusLabel.textColor = UIColor(white: 1, alpha: 0.55)
    statusLabel.font = UIFont.systemFont(ofSize: 14, weight: .regular)

    contentStack.addArrangedSubview(statusLabel)
    contentStack.addArrangedSubview(topicLibraryRow)
    contentStack.addArrangedSubview(replyCenterRow)
    contentStack.addArrangedSubview(linkPreviewLabel)

    let rootStack = UIStackView(arrangedSubviews: [header, contentStack, saveButton])
    rootStack.axis = .vertical
    rootStack.spacing = 18
    rootStack.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(rootStack)

    NSLayoutConstraint.activate([
      rootStack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 28),
      rootStack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -28),
      rootStack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
      rootStack.bottomAnchor.constraint(lessThanOrEqualTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -24),

      header.heightAnchor.constraint(equalToConstant: 44),
      cancelButton.leadingAnchor.constraint(equalTo: header.leadingAnchor),
      cancelButton.centerYAnchor.constraint(equalTo: header.centerYAnchor),
      titleLabel.centerXAnchor.constraint(equalTo: header.centerXAnchor),
      titleLabel.centerYAnchor.constraint(equalTo: header.centerYAnchor),
      titleLabel.leadingAnchor.constraint(greaterThanOrEqualTo: cancelButton.trailingAnchor, constant: 12),
      titleLabel.trailingAnchor.constraint(lessThanOrEqualTo: header.trailingAnchor),

      topicLibraryRow.heightAnchor.constraint(equalToConstant: 78),
      replyCenterRow.heightAnchor.constraint(equalToConstant: 78),
      saveButton.heightAnchor.constraint(equalToConstant: 60)
    ])
  }

  private func makeBoardRow(id: String, title: String, subtitle: String, systemIcon: String) -> UIView {
    let row = UIControl()
    row.translatesAutoresizingMaskIntoConstraints = false
    row.backgroundColor = UIColor(white: 1, alpha: 0.08)
    row.layer.cornerRadius = 18
    row.accessibilityIdentifier = id
    row.addTarget(self, action: #selector(selectBoard(_:)), for: .touchUpInside)

    let iconBox = UIView()
    iconBox.translatesAutoresizingMaskIntoConstraints = false
    iconBox.backgroundColor = UIColor(white: 1, alpha: 0.12)
    iconBox.layer.cornerRadius = 12
    iconBox.isUserInteractionEnabled = false

    let icon = UIImageView(image: UIImage(systemName: systemIcon))
    icon.translatesAutoresizingMaskIntoConstraints = false
    icon.tintColor = .white
    icon.contentMode = .scaleAspectFit

    let rowTextStack = UIStackView()
    rowTextStack.axis = .vertical
    rowTextStack.spacing = 2
    rowTextStack.translatesAutoresizingMaskIntoConstraints = false
    rowTextStack.isUserInteractionEnabled = false

    let rowTitle = UILabel()
    rowTitle.text = title
    rowTitle.textColor = .white
    rowTitle.font = UIFont.systemFont(ofSize: 19, weight: .semibold)
    rowTitle.numberOfLines = 1

    let rowSubtitle = UILabel()
    rowSubtitle.text = subtitle
    rowSubtitle.textColor = UIColor(white: 1, alpha: 0.55)
    rowSubtitle.font = UIFont.systemFont(ofSize: 13, weight: .regular)
    rowSubtitle.numberOfLines = 1

    rowTextStack.addArrangedSubview(rowTitle)
    rowTextStack.addArrangedSubview(rowSubtitle)

    let check = UIImageView(image: UIImage(systemName: "checkmark"))
    check.translatesAutoresizingMaskIntoConstraints = false
    check.tintColor = UIColor(red: 0.82, green: 0.31, blue: 0.49, alpha: 1)
    check.contentMode = .scaleAspectFit
    check.isHidden = id != selectedBoard
    check.isUserInteractionEnabled = false
    boardCheckmarks[id] = check

    row.addSubview(iconBox)
    iconBox.addSubview(icon)
    row.addSubview(rowTextStack)
    row.addSubview(check)

    NSLayoutConstraint.activate([
      iconBox.leadingAnchor.constraint(equalTo: row.leadingAnchor, constant: 16),
      iconBox.centerYAnchor.constraint(equalTo: row.centerYAnchor),
      iconBox.widthAnchor.constraint(equalToConstant: 46),
      iconBox.heightAnchor.constraint(equalToConstant: 46),
      icon.centerXAnchor.constraint(equalTo: iconBox.centerXAnchor),
      icon.centerYAnchor.constraint(equalTo: iconBox.centerYAnchor),
      icon.widthAnchor.constraint(equalToConstant: 24),
      icon.heightAnchor.constraint(equalToConstant: 24),

      rowTextStack.leadingAnchor.constraint(equalTo: iconBox.trailingAnchor, constant: 14),
      rowTextStack.centerYAnchor.constraint(equalTo: row.centerYAnchor),
      rowTextStack.trailingAnchor.constraint(lessThanOrEqualTo: check.leadingAnchor, constant: -12),

      check.trailingAnchor.constraint(equalTo: row.trailingAnchor, constant: -18),
      check.centerYAnchor.constraint(equalTo: row.centerYAnchor),
      check.widthAnchor.constraint(equalToConstant: 28),
      check.heightAnchor.constraint(equalToConstant: 28)
    ])

    return row
  }

  private func updateBoardSelection() {
    boardCheckmarks.forEach { key, checkmark in
      checkmark.isHidden = key != selectedBoard
    }
  }

  private func metaWithSelectedBoard(existingMeta: String? = nil, previewImage: String? = nil) -> String {
    var meta: [String: Any] = [:]

    if let existingMeta,
      let data = existingMeta.data(using: .utf8),
      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
      meta = json
    }

    meta["soonDestination"] = selectedBoard
    meta["soonBoard"] = ""

    let sharedPayloadText = firstNonEmpty(
      normalizedSharedText(extensionContentText),
      sharedText.compactMap { normalizedSharedText($0) }.first
    )
    if let sharedPayloadText {
      meta["soonSharedText"] = sharedPayloadText
      meta["soonSharedTextSource"] = extensionContentText == nil ? "attachment-text" : "extension-item"
    }

    let media = primarySharedMedia()
    let mediaThumbnail = media?.thumbnail ?? (media?.type == .image ? media?.path : nil)
    let resolvedPreviewImage = firstNonEmpty(previewImage, mediaThumbnail)
    if let resolvedPreviewImage {
      meta["soonThumbnail"] = resolvedPreviewImage
    }

    if let media {
      meta["soonLocalMediaPath"] = media.path
      meta["soonLocalMediaType"] = media.type == .video ? "video" : (media.type == .image ? "image" : "file")
      meta["soonLocalThumbnail"] = media.thumbnail ?? (media.type == .image ? media.path : "")
      meta["soonMimeType"] = media.mimeType
      if let width = media.width {
        meta["soonMediaWidth"] = String(width)
      }
      if let height = media.height {
        meta["soonMediaHeight"] = String(height)
      }
      if let duration = media.duration {
        meta["soonMediaDuration"] = String(duration)
      }
    }

    guard let data = try? JSONSerialization.data(withJSONObject: meta),
      let string = String(data: data, encoding: .utf8)
    else {
      let escapedDestination = selectedBoard.replacingOccurrences(of: "\"", with: "\\\"")
      return "{\"soonDestination\":\"\(escapedDestination)\"}"
    }

    return string
  }

  private func firstNonEmpty(_ values: String?...) -> String? {
    for value in values {
      if let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty {
        return trimmed
      }
    }
    return nil
  }

  private func primarySharedMedia() -> SharedMediaFile? {
    return sharedMedia.first(where: { $0.type == .video })
      ?? sharedMedia.first(where: { $0.type == .image })
      ?? sharedMedia.first
  }

  private func bestPreviewImage() -> String? {
    return firstNonEmpty(primarySharedMedia()?.thumbnail, primarySharedMedia()?.type == .image ? primarySharedMedia()?.path : nil)
  }

  private func persistSelectedBoardToSharedPayload() {
    let userDefaults = UserDefaults(suiteName: hostAppGroupIdentifier)
    if !sharedMedia.isEmpty {
      let marker = "soon-destination-\(selectedBoard)__"
      for media in sharedMedia {
        let cleanName = media.fileName.replacingOccurrences(
          of: #"^soon-destination-[a-z-]+__"#,
          with: "",
          options: .regularExpression
        )
        media.fileName = marker + cleanName
      }
      userDefaults?.set(toData(data: sharedMedia), forKey: sharedKey)
      userDefaults?.synchronize()
      return
    }

    guard !sharedWebUrl.isEmpty else { return }
    sharedWebUrl = sharedWebUrl.map {
      if currentShareWebUrlSet.contains(normalizedUrl($0.url)) {
        return WebUrl(url: $0.url, meta: metaWithSelectedBoard(existingMeta: $0.meta))
      }

      return $0
    }
    sharedWebUrl = mergeWithPendingWebUrls(sharedWebUrl, userDefaults: userDefaults)
    userDefaults?.set(toData(data: sharedWebUrl), forKey: sharedKey)
    userDefaults?.synchronize()
  }

  private func normalizedUrl(_ url: String) -> String {
    return url.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private func pendingWebUrls(from userDefaults: UserDefaults?) -> [WebUrl] {
    guard let data = userDefaults?.object(forKey: sharedKey) as? Data,
      let pending = try? JSONDecoder().decode([WebUrl].self, from: data)
    else {
      return []
    }

    return pending
  }

  private func mergeWithPendingWebUrls(_ current: [WebUrl], userDefaults: UserDefaults?) -> [WebUrl] {
    var merged: [WebUrl] = []
    var indexesByUrl: [String: Int] = [:]

    for item in pendingWebUrls(from: userDefaults) + current {
      let normalized = item.url.trimmingCharacters(in: .whitespacesAndNewlines)
      if normalized.isEmpty {
        continue
      }

      if let existingIndex = indexesByUrl[normalized] {
        merged[existingIndex] = WebUrl(url: normalized, meta: item.meta)
      } else {
        indexesByUrl[normalized] = merged.count
        merged.append(WebUrl(url: normalized, meta: item.meta))
      }
    }

    return Array(merged.suffix(50))
  }

  private func finishLoading(type: RedirectType) {
    pendingRedirectType = type
    if type == .weburl && sharedWebUrl.count > 1 {
      statusLabel.text = "已讀取 \(sharedWebUrl.count) 項分享內容"
      saveButton.setTitle("繼續處理 \(sharedWebUrl.count) 項", for: .normal)
    } else {
      statusLabel.text = "已讀取分享內容"
      saveButton.setTitle("繼續", for: .normal)
    }
    saveButton.isEnabled = true
    saveButton.backgroundColor = UIColor(red: 0.82, green: 0.31, blue: 0.49, alpha: 1)
  }

  @objc private func saveToHostApp() {
    guard let pendingRedirectType else { return }
    persistSelectedBoardToSharedPayload()
    saveButton.isEnabled = false
    saveButton.setTitle("正在開啟 EGG…", for: .normal)

    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
      self.redirectToHostApp(type: pendingRedirectType)
    }
  }

  @objc private func selectBoard(_ sender: UIControl) {
    selectedBoard = sender.accessibilityIdentifier ?? "topic-library"
    updateBoardSelection()
  }

  @objc private func cancelShare() {
    extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
  }

  private func dismissWithError(message: String? = nil) {
    DispatchQueue.main.async {
      NSLog("[ERROR] Error loading application ! \(message!)")
      let alert = UIAlertController(
        title: "Error", message: "Error loading application: \(message!)", preferredStyle: .alert)

      let action = UIAlertAction(title: "OK", style: .cancel) { _ in
        self.dismiss(animated: true, completion: nil)
        self.extensionContext!.completeRequest(returningItems: [], completionHandler: nil)
      }

      alert.addAction(action)
      self.present(alert, animated: true, completion: nil)
    }
  }

  private func redirectToHostApp(type: RedirectType) {
    let url = URL(string: "\(shareProtocol)://dataUrl=\(sharedKey)#\(type)")!
    var responder = self as UIResponder?

    while responder != nil {
      if let application = responder as? UIApplication {
        if application.canOpenURL(url) {
          application.open(url)
        } else {
          NSLog("redirectToHostApp canOpenURL KO: \(shareProtocol)")
          self.dismissWithError(
            message: "Application not found, invalid url scheme \(shareProtocol)")
          return
        }
      }
      responder = responder!.next
    }
    extensionContext!.completeRequest(returningItems: [], completionHandler: nil)
  }

  enum RedirectType {
    case media
    case text
    case weburl
    case file
  }

  func getExtension(from url: URL, type: SharedMediaType) -> String {
    let parts = url.lastPathComponent.components(separatedBy: ".")
    var ex: String? = nil
    if parts.count > 1 {
      ex = parts.last
    }
    if ex == nil {
      switch type {
      case .image:
        ex = "PNG"
      case .video:
        ex = "MP4"
      case .file:
        ex = "TXT"
        if url.lastPathComponent.lowercased().contains("pkpass") { ex = "pkpass" }
      }
    }
    return ex ?? "Unknown"
  }

  func getFileName(from url: URL, type: SharedMediaType) -> String {
    var name = url.lastPathComponent
    if name == "" {
      name = UUID().uuidString + "." + getExtension(from: url, type: type)
    }
    return name
  }

  func getFileSize(from url: URL) -> Int? {
    do {
      let resources = try url.resourceValues(forKeys: [.fileSizeKey])
      return resources.fileSize
    } catch {
      NSLog("Error: \(error)")
      return nil
    }
  }

  func copyFile(at srcURL: URL, to dstURL: URL) -> Bool {
    do {
      if FileManager.default.fileExists(atPath: dstURL.path) {
        try FileManager.default.removeItem(at: dstURL)
      }
      try FileManager.default.copyItem(at: srcURL, to: dstURL)
    } catch (let error) {
      NSLog("Cannot copy item at \(srcURL) to \(dstURL): \(error)")
      return false
    }
    return true
  }

  private func getSharedMediaFile(forVideo: URL, fileName: String, fileSize: Int?, mimeType: String)
    -> SharedMediaFile?
  {
    let asset = AVAsset(url: forVideo)
    let thumbnailPath = getThumbnailPath(for: forVideo)
    let duration = (CMTimeGetSeconds(asset.duration) * 1000).rounded()
    var trackWidth: Int? = nil
    var trackHeight: Int? = nil

    // get video info
    let track = asset.tracks(withMediaType: AVMediaType.video).first ?? nil
    if track != nil {
      let size = track!.naturalSize.applying(track!.preferredTransform)
      trackWidth = abs(Int(size.width))
      trackHeight = abs(Int(size.height))
    }

    if FileManager.default.fileExists(atPath: thumbnailPath.path) {
      return SharedMediaFile(
        path: forVideo.absoluteString, thumbnail: thumbnailPath.absoluteString, fileName: fileName,
        fileSize: fileSize, width: trackWidth, height: trackHeight, duration: duration,
        mimeType: mimeType, type: .video)
    }

    var saved = false
    let assetImgGenerate = AVAssetImageGenerator(asset: asset)
    assetImgGenerate.appliesPreferredTrackTransform = true
    assetImgGenerate.maximumSize = CGSize(width: 360, height: 360)
    do {
      let img = try assetImgGenerate.copyCGImage(
        at: CMTimeMakeWithSeconds(600, preferredTimescale: Int32(1.0)), actualTime: nil)
      try UIImage.pngData(UIImage(cgImage: img))()?.write(to: thumbnailPath)
      saved = true
    } catch {
      saved = false
    }

    return saved
      ? SharedMediaFile(
        path: forVideo.absoluteString, thumbnail: thumbnailPath.absoluteString, fileName: fileName,
        fileSize: fileSize, width: trackWidth, height: trackHeight, duration: duration,
        mimeType: mimeType, type: .video) : nil
  }

  private func getThumbnailPath(for url: URL) -> URL {
    let fileName = Data(url.lastPathComponent.utf8).base64EncodedString().replacingOccurrences(
      of: "==", with: "")
    let path = FileManager.default
      .containerURL(forSecurityApplicationGroupIdentifier: self.hostAppGroupIdentifier)!
      .appendingPathComponent("\(fileName).jpg")
    return path
  }

  private func fetchLinkPreviewImage(for url: URL) async -> String? {
    if #available(iOS 13.0, *) {
      return await withCheckedContinuation { continuation in
        let provider = LPMetadataProvider()
        provider.timeout = 4
        provider.startFetchingMetadata(for: url) { metadata, _ in
          guard let imageProvider = metadata?.imageProvider ?? metadata?.iconProvider,
            imageProvider.canLoadObject(ofClass: UIImage.self)
          else {
            continuation.resume(returning: nil)
            return
          }

          imageProvider.loadObject(ofClass: UIImage.self) { object, _ in
            guard let image = object as? UIImage,
              let data = image.jpegData(compressionQuality: 0.82),
              let container = FileManager.default.containerURL(
                forSecurityApplicationGroupIdentifier: self.hostAppGroupIdentifier)
            else {
              continuation.resume(returning: nil)
              return
            }

            let previewURL = container.appendingPathComponent("link-preview-\(UUID().uuidString).jpg")
            do {
              try data.write(to: previewURL)
              Task {
                if let recognizedText = await self.recognizePreviewText(in: image) {
                  await MainActor.run {
                    self.appendSharedText(recognizedText)
                  }
                }
                continuation.resume(returning: previewURL.absoluteString)
              }
            } catch {
              continuation.resume(returning: nil)
            }
          }
        }
      }
    }

    return nil
  }

  private func recognizePreviewText(in image: UIImage) async -> String? {
    guard let cgImage = image.cgImage else { return nil }

    return await withCheckedContinuation { continuation in
      let request = VNRecognizeTextRequest { request, _ in
        let observations = (request.results as? [VNRecognizedTextObservation]) ?? []
        let lines = observations
          .compactMap { $0.topCandidates(1).first?.string.trimmingCharacters(in: .whitespacesAndNewlines) }
          .filter { !$0.isEmpty }

        let text = lines.joined(separator: "\n")
        continuation.resume(returning: self.normalizedSharedText(text))
      }

      request.recognitionLevel = .accurate
      request.usesLanguageCorrection = true
      if #available(iOS 16.0, *) {
        request.revision = VNRecognizeTextRequestRevision3
        request.recognitionLanguages = ["zh-Hant", "zh-Hans", "en-US"]
      }

      DispatchQueue.global(qos: .userInitiated).async {
        do {
          try VNImageRequestHandler(cgImage: cgImage, options: [:]).perform([request])
        } catch {
          continuation.resume(returning: nil)
        }
      }
    }
  }

  class WebUrl: Codable {
    var url: String
    var meta: String

    init(url: String, meta: String) {
      self.url = url
      self.meta = meta
    }
  }

  class SharedMediaFile: Codable {
    var path: String  // can be image, video or url path
    var thumbnail: String?  // video thumbnail
    var fileName: String  // uuid + extension
    var fileSize: Int?
    var width: Int?  // for image
    var height: Int?  // for image
    var duration: Double?  // video duration in milliseconds
    var mimeType: String
    var type: SharedMediaType

    init(
      path: String, thumbnail: String?, fileName: String, fileSize: Int?, width: Int?, height: Int?,
      duration: Double?, mimeType: String, type: SharedMediaType
    ) {
      self.path = path
      self.thumbnail = thumbnail
      self.fileName = fileName
      self.fileSize = fileSize
      self.width = width
      self.height = height
      self.duration = duration
      self.mimeType = mimeType
      self.type = type
    }
  }

  enum SharedMediaType: Int, Codable {
    case image
    case video
    case file
  }

  func toData(data: [WebUrl]) -> Data? {
    let encodedData = try? JSONEncoder().encode(data)
    return encodedData
  }
  func toData(data: [SharedMediaFile]) -> Data? {
    let encodedData = try? JSONEncoder().encode(data)
    return encodedData
  }
}

internal let mimeTypes = [
  "html": "text/html",
  "htm": "text/html",
  "shtml": "text/html",
  "css": "text/css",
  "xml": "text/xml",
  "gif": "image/gif",
  "jpeg": "image/jpeg",
  "jpg": "image/jpeg",
  "js": "application/javascript",
  "atom": "application/atom+xml",
  "rss": "application/rss+xml",
  "mml": "text/mathml",
  "txt": "text/plain",
  "jad": "text/vnd.sun.j2me.app-descriptor",
  "wml": "text/vnd.wap.wml",
  "htc": "text/x-component",
  "png": "image/png",
  "tif": "image/tiff",
  "tiff": "image/tiff",
  "wbmp": "image/vnd.wap.wbmp",
  "ico": "image/x-icon",
  "jng": "image/x-jng",
  "bmp": "image/x-ms-bmp",
  "svg": "image/svg+xml",
  "svgz": "image/svg+xml",
  "webp": "image/webp",
  "woff": "application/font-woff",
  "jar": "application/java-archive",
  "war": "application/java-archive",
  "ear": "application/java-archive",
  "json": "application/json",
  "hqx": "application/mac-binhex40",
  "doc": "application/msword",
  "pdf": "application/pdf",
  "ps": "application/postscript",
  "eps": "application/postscript",
  "ai": "application/postscript",
  "rtf": "application/rtf",
  "m3u8": "application/vnd.apple.mpegurl",
  "xls": "application/vnd.ms-excel",
  "eot": "application/vnd.ms-fontobject",
  "ppt": "application/vnd.ms-powerpoint",
  "wmlc": "application/vnd.wap.wmlc",
  "kml": "application/vnd.google-earth.kml+xml",
  "kmz": "application/vnd.google-earth.kmz",
  "7z": "application/x-7z-compressed",
  "cco": "application/x-cocoa",
  "jardiff": "application/x-java-archive-diff",
  "jnlp": "application/x-java-jnlp-file",
  "pkpass": "application/vnd.apple.pkpass",
  "run": "application/x-makeself",
  "pl": "application/x-perl",
  "pm": "application/x-perl",
  "prc": "application/x-pilot",
  "pdb": "application/x-pilot",
  "rar": "application/x-rar-compressed",
  "rpm": "application/x-redhat-package-manager",
  "sea": "application/x-sea",
  "swf": "application/x-shockwave-flash",
  "sit": "application/x-stuffit",
  "tcl": "application/x-tcl",
  "tk": "application/x-tcl",
  "der": "application/x-x509-ca-cert",
  "pem": "application/x-x509-ca-cert",
  "crt": "application/x-x509-ca-cert",
  "xpi": "application/x-xpinstall",
  "xhtml": "application/xhtml+xml",
  "xspf": "application/xspf+xml",
  "zip": "application/zip",
  "epub": "application/epub+zip",
  "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "mid": "audio/midi",
  "midi": "audio/midi",
  "kar": "audio/midi",
  "mp3": "audio/mpeg",
  "ogg": "audio/ogg",
  "m4a": "audio/x-m4a",
  "ra": "audio/x-realaudio",
  "3gpp": "video/3gpp",
  "3gp": "video/3gpp",
  "ts": "video/mp2t",
  "mp4": "video/mp4",
  "mpeg": "video/mpeg",
  "mpg": "video/mpeg",
  "mov": "video/quicktime",
  "webm": "video/webm",
  "flv": "video/x-flv",
  "m4v": "video/x-m4v",
  "mng": "video/x-mng",
  "asx": "video/x-ms-asf",
  "asf": "video/x-ms-asf",
  "wmv": "video/x-ms-wmv",
  "avi": "video/x-msvideo",
]

extension URL {
  func mimeType(ext: String?) -> String {
    if #available(iOSApplicationExtension 14.0, *) {
      if let pathExt = ext,
        let mimeType = UTType(filenameExtension: pathExt)?.preferredMIMEType
      {
        return mimeType
      } else {
        return "application/octet-stream"
      }
    } else {
      return mimeTypes[ext?.lowercased() ?? ""] ?? "application/octet-stream"
    }
  }
}

extension Array {
  subscript(safe index: UInt) -> Element? {
    return Int(index) < count ? self[Int(index)] : nil
  }
}
