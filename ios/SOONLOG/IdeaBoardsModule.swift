import Foundation

@objc(IdeaBoardsModule)
class IdeaBoardsModule: NSObject {
  private let appGroupIdentifier = "group.network.sooncreator.log"
  private let boardsKey = "soonlogIdeaBoards"

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc(getBoards:rejecter:)
  func getBoards(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    let userDefaults = UserDefaults(suiteName: appGroupIdentifier)
    let boards = userDefaults?.stringArray(forKey: boardsKey) ?? []
    resolve(boards)
  }
}
