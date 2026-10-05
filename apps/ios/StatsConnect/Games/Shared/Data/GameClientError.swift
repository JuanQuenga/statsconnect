import Foundation

enum GameClientError: LocalizedError, Equatable {
    case invalidEndpoint
    case requestEncoding
    case malformedBody
    case tagMismatch
    case serverStatus(statusCode: Int)
    case network(message: String)

    var errorDescription: String? {
        switch self {
        case .invalidEndpoint:
            return "Could not reach the StatsConnect service. Please try again later."
        case .requestEncoding:
            return "Could not prepare the request. Please try again."
        case .malformedBody:
            return "The server returned data in an unexpected format. Please try again later."
        case .tagMismatch:
            return "The server returned a different player than requested. Please try again."
        case .serverStatus(let statusCode):
            switch statusCode {
            case 400: return "That player tag doesn’t look right. Check it in the game and try again."
            case 404: return "No player was found for that tag. Check the tag and try again."
            case 429: return "The game service is busy. Give it a moment, then try again."
            default: return "The game service is unavailable right now. Please try again later."
            }
        case .network(let message):
            return message
        }
    }

    static func friendlyMessage(for error: Error) -> String {
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain {
            switch nsError.code {
            case NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost, NSURLErrorDataNotAllowed:
                return "You appear to be offline. Check your connection and try again."
            case NSURLErrorTimedOut:
                return "The request timed out. Please try again."
            case NSURLErrorCannotFindHost, NSURLErrorCannotConnectToHost:
                return "Could not reach the StatsConnect service. Please try again later."
            default:
                break
            }
        }
        return "Could not load the profile. Please check your connection and try again."
    }
}
