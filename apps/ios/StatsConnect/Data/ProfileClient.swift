import Foundation

public struct ProfileClient: Sendable {
    let baseURL: URL
    let session: URLSession

    public init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    private struct RequestEnvelope: Encodable {
        let path: String
        let format: String
        let args: [Args]
        struct Args: Encodable {
            let viewerId: String
            let game: String
            let playerTag: String
        }
    }

    private struct ResponseEnvelope: Decodable {
        let status: String
        let value: ProfileResult?
        let errorData: ErrorData?
        let errorMessage: String?
    }

    private struct ErrorData: Decodable, Sendable {
        let code: String
        let message: String
    }

    public func preview(game: GameID, tag: PlayerTag, viewerID: String) async throws -> ProfileResult {
        let endpoint = baseURL.appendingPathComponent("api/action")
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body = RequestEnvelope(
            path: "hub/profiles:preview",
            format: "convex_encoded_json",
            args: [.init(viewerId: viewerID, game: game.rawValue, playerTag: tag.rawValue)]
        )
        do {
            request.httpBody = try JSONEncoder().encode(body)
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            throw ProfileClientError.requestEncoding
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch is CancellationError {
            throw CancellationError()
        } catch let error as URLError where error.code == .cancelled {
            throw CancellationError()
        } catch {
            throw ProfileClientError.network(message: Self.friendlyMessage(for: error))
        }

        guard let http = response as? HTTPURLResponse else {
            throw ProfileClientError.network(message: "The server returned an unexpected response.")
        }

        let envelope: ResponseEnvelope
        do {
            envelope = try JSONDecoder().decode(ResponseEnvelope.self, from: data)
        } catch {
            if !(200...299).contains(http.statusCode) {
                throw ProfileClientError.network(message: "The server is having trouble right now (HTTP \(http.statusCode)). Please try again later.")
            }
            throw ProfileClientError.malformedBody
        }

        if envelope.status == "error" {
            if let errorData = envelope.errorData {
                throw ProfileClientError.structured(code: errorData.code, message: Self.friendlyStructuredMessage(code: errorData.code, raw: errorData.message))
            }
            throw ProfileClientError.network(message: "Something went wrong fetching this profile. Please try again.")
        }

        guard (200...299).contains(http.statusCode) else {
            throw ProfileClientError.network(message: "The service is unavailable. Please try again later.")
        }
        guard envelope.status == "success", let value = envelope.value else {
            throw ProfileClientError.malformedBody
        }

        return try Self.validate(value, requestedGame: game, requestedTag: tag.rawValue)
    }

    static func validate(_ result: ProfileResult, requestedGame: GameID, requestedTag: String) throws -> ProfileResult {
        let responseTag = (try? PlayerTag(result.data.playerTag))?.rawValue
        let requestedNormalized = (try? PlayerTag(requestedTag))?.rawValue
        guard let responseTag, let requestedNormalized, responseTag == requestedNormalized else {
            throw ProfileClientError.tagMismatch
        }
        guard result.data.game == requestedGame else {
            throw ProfileClientError.gameMismatch
        }
        return result
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

    static func friendlyStructuredMessage(code: String, raw: String) -> String {
        switch code {
        case "PROFILE_NOT_FOUND", "NOT_FOUND":
            return "No profile was found for that player tag."
        case "UNAUTHENTICATED", "UNAUTHORIZED":
            return "You are not signed in, or you don't have access to this profile."
        case "RATE_LIMITED":
            return "Too many requests. Please wait a moment and try again."
        case "INVALID_TAG", "INVALID_ARGUMENT":
            return "The request was invalid. Double-check the player tag and try again."
        case "NOT_CONFIGURED", "UPSTREAM_FORBIDDEN", "UPSTREAM_UNAVAILABLE":
            return "Live stats for this game are temporarily unavailable. Please try again later."
        case "INVALID_VIEWER":
            return "Your device session could not be verified. Please reopen the app and try again."
        case "BAD_UPSTREAM_RESPONSE":
            return "The game service returned an unreadable profile. Please try again later."
        default:
            return "The server reported an error. Please try again later."
        }
    }
}

public enum ProfileClientError: LocalizedError, Equatable {
    case requestEncoding
    case malformedBody
    case tagMismatch
    case gameMismatch
    case structured(code: String, message: String)
    case network(message: String)

    public var errorDescription: String? {
        switch self {
        case .requestEncoding:
            return "Could not prepare the request. Please try again."
        case .malformedBody:
            return "The server returned data in an unexpected format. Please try again later."
        case .tagMismatch:
            return "The server returned a different player than requested. Please try again."
        case .gameMismatch:
            return "The profile returned doesn't match the selected game. Please try again."
        case .structured(_, let message):
            return message
        case .network(let message):
            return message
        }
    }
}
