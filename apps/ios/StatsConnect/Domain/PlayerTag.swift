import Foundation

public struct PlayerTag: Hashable, Sendable {
    public let rawValue: String

    private static let pattern = "^[0289PYLQGRJCUV]{3,15}$"

    public init(_ input: String) throws {
        var value = input.trimmingCharacters(in: .whitespacesAndNewlines)
        value = value.replacingOccurrences(of: " ", with: "")
        if value.hasPrefix("#") {
            value = String(value.dropFirst())
        }
        value = value.uppercased()

        guard let regex = try? NSRegularExpression(pattern: Self.pattern),
              regex.firstMatch(in: value, range: NSRange(value.startIndex..., in: value)) != nil else {
            throw PlayerTagError.invalidTag(value)
        }
        self.rawValue = value
    }

    public enum PlayerTagError: LocalizedError, Equatable {
        case invalidTag(String)

        public var errorDescription: String? {
            switch self {
            case .invalidTag(let value):
                return "“\(value)” is not a valid player tag. Tags are 3–15 characters using only 0, 2, 8, 9, P, Y, L, Q, G, R, J, C, U, V."
            }
        }
    }
}
