import Foundation

enum ProfileLookupState: Equatable, Sendable {
    case idle
    case loading(previous: ProfileResult?)
    case loaded(ProfileResult)
    case error(message: String, previous: ProfileResult?)

    var result: ProfileResult? {
        switch self {
        case .idle:
            return nil
        case .loading(let previous):
            return previous
        case .loaded(let result):
            return result
        case .error(_, let previous):
            return previous
        }
    }

    var errorMessage: String? {
        guard case .error(let message, _) = self else {
            return nil
        }
        return message
    }

    var isLoading: Bool {
        if case .loading = self {
            return true
        }
        return false
    }
}
