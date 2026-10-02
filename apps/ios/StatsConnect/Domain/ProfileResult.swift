import Foundation

public struct ProfileResult: Codable, Equatable, Identifiable, Sendable {
    public var id: String { data.id }
    public let data: ProfileSummary
    public let cache: CacheMetadata

    public init(data: ProfileSummary, cache: CacheMetadata) {
        self.data = data
        self.cache = cache
    }
}
