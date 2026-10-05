import Foundation

struct ClashRoyaleClient: Sendable {
    let baseURL: URL
    let session: URLSession

    init(baseURL: URL = AppConfiguration.backendURL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    private struct RequestEnvelope: Encodable {
        let path: String
        let format: String
        let args: [Args]
        struct Args: Encodable {
            let tag: String
        }
    }

    private struct ResponseEnvelope: Decodable {
        let status: String
        let value: ClashProfilePayload?
        let errorData: ErrorData?

        struct ErrorData: Decodable {
            let code: String?
        }
    }

    func profile(tag: PlayerTag) async throws -> ClashProfilePayload {
        let endpoint = baseURL.appendingPathComponent("api/action")

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body = RequestEnvelope(
            path: "clash/clashApi:getPlayerBundle",
            format: "convex_encoded_json",
            args: [.init(tag: tag.rawValue)]
        )
        do {
            request.httpBody = try JSONEncoder().encode(body)
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            throw GameClientError.requestEncoding
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
            throw GameClientError.network(message: GameClientError.friendlyMessage(for: error))
        }

        guard let http = response as? HTTPURLResponse else {
            throw GameClientError.network(message: "The server returned an unexpected response.")
        }
        guard (200...299).contains(http.statusCode) else {
            let code = (try? JSONDecoder().decode(ResponseEnvelope.self, from: data))?.errorData?.code
            if code == "CLASH_API_404" { throw GameClientError.serverStatus(statusCode: 404) }
            if code == "INVALID_TAG" || code == "CLASH_API_400" { throw GameClientError.serverStatus(statusCode: 400) }
            if code == "CLASH_API_429" { throw GameClientError.serverStatus(statusCode: 429) }
            throw GameClientError.serverStatus(statusCode: http.statusCode)
        }

        let envelope: ResponseEnvelope
        do {
            envelope = try JSONDecoder().decode(ResponseEnvelope.self, from: data)
        } catch {
            throw GameClientError.malformedBody
        }

        guard envelope.status == "success", let payload = envelope.value else {
            if envelope.errorData?.code == "CLASH_API_404" { throw GameClientError.serverStatus(statusCode: 404) }
            throw GameClientError.network(message: "Something went wrong fetching this profile. Please try again.")
        }

        let responseTag = (try? PlayerTag(payload.player.data.tag))?.rawValue
        let requestedNormalized = (try? PlayerTag(tag.rawValue))?.rawValue
        guard let responseTag, let requestedNormalized, responseTag == requestedNormalized else {
            throw GameClientError.tagMismatch
        }
        return payload
    }
}
