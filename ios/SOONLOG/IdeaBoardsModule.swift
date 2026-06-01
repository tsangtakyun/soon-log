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

  @objc(setBoards:resolver:rejecter:)
  func setBoards(_ boards: [String], resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    let cleaned = boards
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty && $0 != "Recents" }
    let unique = Array(NSOrderedSet(array: cleaned)) as? [String] ?? cleaned
    let userDefaults = UserDefaults(suiteName: appGroupIdentifier)
    userDefaults?.set(unique, forKey: boardsKey)
    userDefaults?.synchronize()
    resolve(unique)
  }
}
