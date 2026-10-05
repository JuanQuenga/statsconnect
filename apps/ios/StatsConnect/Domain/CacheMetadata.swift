import Foundation

public struct CacheMetadata: Codable, Equatable, Sendable {
    public let state: String
    public let fetchedAt: Double
    public let expiresAt: Double
    public var isStale: Bool {
        state == "stale" || Date().timeIntervalSince1970 * 1000 >= expiresAt
    }
    public var fetchedDate: Date { Date(timeIntervalSince1970: fetchedAt / 1000) }

    public init(state: String, fetchedAt: Double, expiresAt: Double) {
        self.state = state
        self.fetchedAt = fetchedAt
        self.expiresAt = expiresAt
    }
}
