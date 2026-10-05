import Foundation
import Synchronization
import XCTest
@testable import StatsConnect

enum StubReply: Sendable { case response(Int, Data); case cancelled }
struct RequestSnapshot: Sendable { let method, contentType: String?; let body: Data?; let url: URL? }
private struct FixtureRecord: Sendable { let reply: StubReply; var request: RequestSnapshot? }

final class StubURLProtocol: URLProtocol {
    private static let fixtures = Mutex<[String: FixtureRecord]>([:])
    static func install(_ reply: StubReply) -> String {
        let id = UUID().uuidString.lowercased()
        fixtures.withLock { $0[id] = FixtureRecord(reply: reply, request: nil) }
        return id
    }
    static func snapshot(_ id: String) -> RequestSnapshot? { fixtures.withLock { $0[id]?.request } }
    static func remove(_ id: String) { _ = fixtures.withLock { $0.removeValue(forKey: id) } }
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    private static func body(_ request: URLRequest) -> Data? {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return nil }
        stream.open(); defer { stream.close() }
        let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: 1024); defer { buffer.deallocate() }
        var data = Data()
        while stream.hasBytesAvailable {
            let count = stream.read(buffer, maxLength: 1024)
            if count <= 0 { break }
            data.append(buffer, count: count)
        }
        return data
    }
    private static func record(_ request: URLRequest) -> FixtureRecord? {
        guard let host = request.url?.host, let dot = host.firstIndex(of: ".") else { return nil }
        let id = String(host[..<dot])
        return fixtures.withLock { records in
            guard var record = records[id] else { return nil }
            record.request = .init(method: request.httpMethod, contentType: request.value(forHTTPHeaderField: "Content-Type"), body: body(request), url: request.url)
            records[id] = record
            return record
        }
    }
    override func startLoading() {
        guard let fixture = Self.record(request) else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse)); return
        }
        switch fixture.reply {
        case .cancelled: client?.urlProtocol(self, didFailWithError: URLError(.cancelled))
        case .response(let status, let data):
            let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        }
    }
    override func stopLoading() {}
}

final class DataTests: XCTestCase {
    func testPlayerTagLengthAndCharacterRules() throws {
        let maximum = "2P0LQ0P0LQ0P0LQ"
        XCTAssertEqual(try PlayerTag(" #2p0 ").rawValue, "2P0")
        XCTAssertEqual(try PlayerTag("#2p 0").rawValue, "2P0")
        XCTAssertEqual(try PlayerTag(maximum).rawValue, maximum)
        XCTAssertThrowsError(try PlayerTag("2P"))
        XCTAssertThrowsError(try PlayerTag(maximum + "0"))
        XCTAssertThrowsError(try PlayerTag("ABC"))
    }
    func testCanonicalProfileID() {
        XCTAssertEqual(ProfileSummary(game: .brawlStars, playerTag: "#2p0lq", display: .init(name: "P")).id, "brawl-stars#2P0LQ")
    }
    func testStaleAndExpiredMetadataDoNotEncodeIsStale() throws {
        let future = Date().timeIntervalSince1970 * 1000 + 60_000
        let values = [CacheMetadata(state: "stale", fetchedAt: 1, expiresAt: future),
                      CacheMetadata(state: "fresh", fetchedAt: 1, expiresAt: 0)]
        XCTAssertTrue(values[0].isStale); XCTAssertTrue(values[1].isStale)
        for value in values {
            let json = try JSONEncoder().encode(value)
            let object = try XCTUnwrap(JSONSerialization.jsonObject(with: json) as? [String: Any])
            XCTAssertNil(object["isStale"])
        }
    }

    private func makeClient(_ reply: StubReply) -> (ProfileClient, String) {
        let id = StubURLProtocol.install(reply), configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        return (ProfileClient(baseURL: URL(string: "https://\(id).backend.test")!, session: URLSession(configuration: configuration)), id)
    }
    private func successBody(_ game: GameID = .brawlStars, tag: String = "#2P0LQ", display: [String: Any]? = nil) throws -> Data {
        let now = Date().timeIntervalSince1970 * 1000
        return try JSONSerialization.data(withJSONObject: ["status": "success", "value": [
            "data": ["game": game.rawValue, "playerTag": tag, "display": display ?? [
                "name": "Player One", "avatarUrl": NSNull(), "headline": NSNull(), "affiliation": NSNull(),
            ]], "cache": ["state": "fresh", "fetchedAt": now, "expiresAt": now + 60_000],
        ]])
    }
    private func clientError(_ reply: StubReply, game: GameID = .brawlStars) async -> ProfileClientError? {
        let (client, id) = makeClient(reply); defer { StubURLProtocol.remove(id) }
        do { _ = try await client.preview(game: game, tag: PlayerTag("2P0LQ"), viewerID: "viewer-test"); return nil }
        catch let error as ProfileClientError { return error } catch { return nil }
    }

    func testHashPrefixedResponseWithoutIDAndNullableFields() async throws {
        let (client, id) = makeClient(.response(200, try successBody(tag: "#2p0lq"))); defer { StubURLProtocol.remove(id) }
        let result = try await client.preview(game: .brawlStars, tag: PlayerTag("2P0LQ"), viewerID: "viewer")
        XCTAssertEqual(result.data.playerTag, "#2p0lq")
        XCTAssertEqual(result.data.id, "brawl-stars#2P0LQ")
        XCTAssertNil(result.data.display.avatarUrl); XCTAssertNil(result.data.display.headline); XCTAssertNil(result.data.display.affiliation)
    }
    func testRequestWireBody() async throws {
        let (client, id) = makeClient(.response(200, try successBody(.clashRoyale))); defer { StubURLProtocol.remove(id) }
        _ = try await client.preview(game: .clashRoyale, tag: PlayerTag("2P0LQ"), viewerID: "viewer-9")
        let request = try XCTUnwrap(StubURLProtocol.snapshot(id))
        XCTAssertEqual(request.method, "POST"); XCTAssertEqual(request.contentType, "application/json")
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: try XCTUnwrap(request.body)) as? [String: Any])
        XCTAssertEqual(json["path"] as? String, "hub/profiles:preview")
        XCTAssertEqual(json["format"] as? String, "convex_encoded_json")
        let args = try XCTUnwrap((json["args"] as? [[String: Any]])?.first)
        XCTAssertEqual(args["viewerId"] as? String, "viewer-9"); XCTAssertEqual(args["game"] as? String, "clash-royale")
        XCTAssertEqual(args["playerTag"] as? String, "2P0LQ")
    }
    func testWrongGameAndTagAreRejected() async throws {
        let wrongTag = await clientError(.response(200, try successBody(tag: "#222222")))
        XCTAssertEqual(wrongTag, .tagMismatch)
        let wrongGame = await clientError(.response(200, try successBody(.clashRoyale)))
        XCTAssertEqual(wrongGame, .gameMismatch)
    }
    func testHTTP560ProfileNotFoundIsStructured() async throws {
        let body = try JSONSerialization.data(withJSONObject: ["status": "error", "errorData": ["code": "PROFILE_NOT_FOUND", "message": "private detail"]])
        let error = await clientError(.response(560, body))
        guard case .structured(let code, let message)? = error else { return XCTFail("Expected structured error") }
        XCTAssertEqual(code, "PROFILE_NOT_FOUND"); XCTAssertEqual(message, "No profile was found for that player tag.")
        XCTAssertFalse(message.contains("private detail"))
    }
    func testRawErrorMessageIsHidden() async throws {
        let body = try JSONSerialization.data(withJSONObject: ["status": "error", "errorMessage": "private detail"])
        let error = await clientError(.response(200, body))
        guard case .network(let message)? = error else { return XCTFail("Expected friendly fallback") }
        XCTAssertEqual(message, "Something went wrong fetching this profile. Please try again.")
        XCTAssertFalse(message.contains("private detail"))
    }
    func testMalformedAndUnknownStatusAreRejected() async throws {
        let malformed = await clientError(.response(200, Data("not json".utf8)))
        XCTAssertEqual(malformed, .malformedBody)
        let body = try JSONSerialization.data(withJSONObject: ["status": "pending"])
        let unknown = await clientError(.response(200, body))
        XCTAssertEqual(unknown, .malformedBody)
    }
    func testNon2xxSuccessEnvelopeIsRejected() async throws {
        let error = await clientError(.response(503, try successBody()))
        guard case .network(let message)? = error else { return XCTFail("Expected HTTP failure") }
        XCTAssertEqual(message, "The service is unavailable. Please try again later.")
    }
    func testURLErrorCancelledPreservesCancellationError() async throws {
        let (client, id) = makeClient(.cancelled); defer { StubURLProtocol.remove(id) }
        do {
            _ = try await client.preview(game: .brawlStars, tag: PlayerTag("2P0LQ"), viewerID: "viewer")
            XCTFail("Expected cancellation")
        } catch is CancellationError {
        } catch {
            XCTFail("Expected CancellationError, got \(error)")
        }
    }

    private func makeDefaults() -> (UserDefaults, String) {
        let name = "DataTests-\(UUID().uuidString)", defaults = UserDefaults(suiteName: name)!
        defaults.removePersistentDomain(forName: name); return (defaults, name)
    }
    private func sample(_ game: GameID = .brawlStars, _ name: String = "Player", _ score: Double = 100) -> ProfileResult {
        ProfileResult(data: ProfileSummary(game: game, playerTag: "#2P0LQ", display: .init(name: name, headline: .init(label: "Trophies", value: score))),
                      cache: CacheMetadata(state: "fresh", fetchedAt: 1_700_000_000_000, expiresAt: 4_000_000_000_000))
    }
    @MainActor
    func testSavedProfilesPersistenceDedupeRemoveAndGameIsolation() async {
        let (defaults, suite) = makeDefaults(); defer { defaults.removePersistentDomain(forName: suite) }
        let store = SavedProfilesStore(defaults: defaults), original = sample()
        XCTAssertTrue(store.save(original)); XCTAssertTrue(store.contains(original.data))
        let updated = sample(.brawlStars, "Updated")
        XCTAssertTrue(store.save(updated)); XCTAssertEqual(store.savedProfiles.count, 1)
        XCTAssertEqual(store.savedProfiles.first?.data.display.name, "Updated")
        let royale = sample(.clashRoyale)
        XCTAssertNotEqual(royale.data.id, updated.data.id); XCTAssertTrue(store.save(royale))
        XCTAssertEqual(store.savedProfiles.count, 2); XCTAssertTrue(store.remove(id: updated.data.id))
        XCTAssertFalse(store.contains(updated.data)); XCTAssertFalse(store.remove(id: "missing#TAG"))
        let reloaded = SavedProfilesStore(defaults: defaults)
        XCTAssertEqual(reloaded.savedProfiles, store.savedProfiles); XCTAssertNotNil(UUID(uuidString: store.viewerID))
        XCTAssertEqual(reloaded.viewerID, store.viewerID)
    }
    @MainActor
    func testCorruptSavedDataKeepsStableViewerUUID() async {
        let (defaults, suite) = makeDefaults(); defer { defaults.removePersistentDomain(forName: suite) }
        let first = SavedProfilesStore(defaults: defaults)
        defaults.set(Data("corrupt".utf8), forKey: "savedProfiles")
        let restored = SavedProfilesStore(defaults: defaults)
        XCTAssertTrue(restored.savedProfiles.isEmpty); XCTAssertNotNil(restored.lastError)
        XCTAssertEqual(restored.viewerID, first.viewerID)
    }
    @MainActor
    func testFailedJSONEncodingDoesNotClaimOrPersistSave() async {
        let (defaults, suite) = makeDefaults(); defer { defaults.removePersistentDomain(forName: suite) }
        let store = SavedProfilesStore(defaults: defaults), original = sample()
        XCTAssertTrue(store.save(original))
        let persisted = defaults.data(forKey: "savedProfiles"), invalid = sample(.brawlStars, "Unencodable", .infinity)
        XCTAssertEqual(invalid.data.id, original.data.id); XCTAssertFalse(store.save(invalid))
        XCTAssertEqual(store.savedProfiles, [original]); XCTAssertEqual(defaults.data(forKey: "savedProfiles"), persisted)
        XCTAssertNotNil(store.lastError)
    }
}
