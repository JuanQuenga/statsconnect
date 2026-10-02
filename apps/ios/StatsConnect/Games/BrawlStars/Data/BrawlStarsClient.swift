import Foundation

struct BrawlStarsClient: Sendable {
    let baseURL: URL
    let session: URLSession

    init(baseURL: URL = AppConfiguration.backendURL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    func profile(tag: PlayerTag) async throws -> BrawlProfilePayload {
        let endpoint = try Self.endpointURL(from: baseURL, tag: tag.rawValue)

        var request = URLRequest(url: endpoint)
        request.httpMethod = "GET"
        request.timeoutInterval = 30

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
            throw GameClientError.serverStatus(statusCode: http.statusCode)
        }

        let payload: BrawlProfilePayload
        do {
            payload = try JSONDecoder().decode(BrawlProfilePayload.self, from: data)
        } catch {
            throw GameClientError.malformedBody
        }

        let responseTag = (try? PlayerTag(payload.player.tag))?.rawValue
        let requestedNormalized = (try? PlayerTag(tag.rawValue))?.rawValue
        guard let responseTag, let requestedNormalized, responseTag == requestedNormalized else {
            throw GameClientError.tagMismatch
        }
        return payload
    }

    /// Derives the `.convex.site` host from a `.convex.cloud` base URL and builds
    /// `GET /api/player?tag=#NORMALIZED`.
    static func endpointURL(from baseURL: URL, tag: String) throws -> URL {
        guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false),
              var host = components.host else {
            throw GameClientError.invalidEndpoint
        }
        if host.hasSuffix(".convex.cloud") {
            host = String(host.dropLast("cloud".count)) + "site"
            components.host = host
        }
        guard components.host?.hasSuffix(".convex.site") == true else {
            throw GameClientError.invalidEndpoint
        }
        components.path = "/api/player"
        let normalized = (try? PlayerTag(tag))?.rawValue ?? tag.uppercased()
        components.queryItems = [URLQueryItem(name: "tag", value: "#\(normalized)")]
        guard let url = components.url else {
            throw GameClientError.invalidEndpoint
        }
        return url
    }
}
