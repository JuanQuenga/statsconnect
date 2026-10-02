import Foundation

public struct ProfileDisplay: Codable, Equatable, Sendable {
    public let name: String
    public let avatarUrl: String?
    public let headline: Headline?
    public let affiliation: Affiliation?

    public struct Headline: Codable, Equatable, Sendable {
        public let label: String
        public let value: Double

        public init(label: String, value: Double) {
            self.label = label
            self.value = value
        }
    }

    public struct Affiliation: Codable, Equatable, Sendable {
        public let name: String
        public let tag: String?

        public init(name: String, tag: String? = nil) {
            self.name = name
            self.tag = tag
        }
    }

    public init(name: String, avatarUrl: String? = nil, headline: Headline? = nil, affiliation: Affiliation? = nil) {
        self.name = name
        self.avatarUrl = avatarUrl
        self.headline = headline
        self.affiliation = affiliation
    }
}
