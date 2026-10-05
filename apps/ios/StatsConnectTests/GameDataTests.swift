import Foundation
import XCTest
@testable import StatsConnect

final class GameDataTests: XCTestCase {
    private let brawl = ##"{"player":{"tag":"#2P0LQ","name":"Player","trophies":1000,"highestTrophies":1100,"expLevel":10,"3vs3Victories":18,"brawlers":[{"id":16000000,"name":"SHELLY","power":9,"rank":5,"trophies":100,"highestTrophies":120,"hypercharges":[{"id":23000613,"name":"DOUBLE BARREL"}]}]},"battleLog":{"items":[]}}"##
    private let clash = ##"{"status":"success","value":{"player":{"data":{"tag":"#2P0LQ","name":"Player","currentDeck":[{"id":26000000,"name":"Knight","level":9,"maxLevel":16,"rarity":"common","elixirCost":3}],"cards":null},"fetchedAt":1700000000000,"stale":true},"battles":{"data":[{"team":[{"tag":"#2P0LQ","name":"Player"}]}],"fetchedAt":1700000000000,"stale":false},"chests":{"data":{},"fetchedAt":1700000000000,"stale":false}}}"##

    private func fixture(_ body: String, status: Int = 200) -> (URL, URLSession, String) {
        fixture(.response(status, Data(body.utf8)))
    }
    private func fixture(_ reply: StubReply) -> (URL, URLSession, String) {
        let id = StubURLProtocol.install(reply)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        return (URL(string: "https://\(id).convex.cloud")!, URLSession(configuration: configuration), id)
    }

    func testBrawlWireRequestAndHyperchargeAlias() async throws {
        let (url, session, id) = fixture(brawl); defer { StubURLProtocol.remove(id) }
        let payload = try await BrawlStarsClient(baseURL: url, session: session).profile(tag: PlayerTag("2P0LQ"))
        XCTAssertEqual(payload.player.threeVsThreeVictories, 18)
        XCTAssertEqual(payload.player.brawlers.first?.hyperCharges.first?.name, "DOUBLE BARREL")
        XCTAssertEqual(payload.player.brawlers.first?.portraitURL?.lastPathComponent, "16000000.png")
        let request = try XCTUnwrap(StubURLProtocol.snapshot(id))
        XCTAssertEqual(request.method, "GET")
        let endpoint = try XCTUnwrap(request.url)
        XCTAssertEqual(endpoint.host, "\(id).convex.site")
        XCTAssertEqual(endpoint.path, "/api/player")
        XCTAssertEqual(URLComponents(url: endpoint, resolvingAgainstBaseURL: false)?.queryItems?.first?.value, "#2P0LQ")
    }

    func testClashEnvelopePartialFieldsAndWireRequest() async throws {
        let (url, session, id) = fixture(clash); defer { StubURLProtocol.remove(id) }
        let payload = try await ClashRoyaleClient(baseURL: url, session: session).profile(tag: PlayerTag("2P0LQ"))
        XCTAssertTrue(payload.player.stale)
        XCTAssertEqual(GameProfileFormat.cacheDate(milliseconds: payload.player.fetchedAt)?.timeIntervalSince1970, 1_700_000_000)
        XCTAssertNil(payload.player.data.cards)
        XCTAssertNil(payload.player.data.trophies)
        XCTAssertEqual(payload.player.data.currentDeck.first?.displayLevel, 9)
        XCTAssertEqual(payload.battles.data.first?.opponent.count, 0)
        XCTAssertEqual(payload.battles.data.first?.team.first?.cards.count, 0)
        XCTAssertTrue(payload.chests.data.items.isEmpty)
        let request = try XCTUnwrap(StubURLProtocol.snapshot(id))
        XCTAssertEqual(request.method, "POST")
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: try XCTUnwrap(request.body)) as? [String: Any])
        XCTAssertEqual(json["path"] as? String, "clash/clashApi:getPlayerBundle")
        XCTAssertEqual(json["format"] as? String, "convex_encoded_json")
        XCTAssertEqual((json["args"] as? [[String: String]])?.first?["tag"], "2P0LQ")
    }

    func testClashCardLevelsAcrossRarities() throws {
        for (rarity, expected) in [("common", 1), ("rare", 3), ("epic", 6), ("legendary", 9), ("champion", 11)] {
            let data = Data("{\"id\":1,\"name\":\"Card\",\"level\":1,\"rarity\":\"\(rarity)\"}".utf8)
            XCTAssertEqual(try JSONDecoder().decode(ClashCard.self, from: data).displayLevel, expected)
        }
    }

    func testPartialBrawlBattlesPreservePlayerAndKnownMetadata() throws {
        let body = brawl.replacingOccurrences(of: "\"items\":[]", with: "\"items\":[{}, {\"battle\":{\"teams\":[[{\"tag\":\"#2P0LQ\"}]]}}]")
        let payload = try JSONDecoder().decode(BrawlProfilePayload.self, from: Data(body.utf8))
        XCTAssertEqual(payload.player.name, "Player")
        XCTAssertEqual(payload.battleLog.items.count, 2)
        XCTAssertNil(payload.battleLog.items.first?.event.map)
        XCTAssertEqual(payload.battleLog.items.last?.battle.teams?.first?.first?.tag, "#2P0LQ")
        XCTAssertNil(payload.battleLog.items.last?.battle.teams?.first?.first?.brawler)
    }

    func testClashScoresUseSelectedSideAndDoNotDoubleCountTwoVersusTwo() throws {
        let data = Data(##"{"team":[{"tag":"#222","crowns":1},{"tag":"#228","crowns":1}],"opponent":[{"tag":"#2P0LQ","crowns":3},{"tag":"#2P0","crowns":3}]}"##.utf8)
        let battle = try JSONDecoder().decode(ClashBattle.self, from: data)
        let score = try XCTUnwrap(battle.crownScore(for: "2P0LQ"))
        XCTAssertEqual(score.player, 3)
        XCTAssertEqual(score.other, 1)
        XCTAssertNil(battle.crownScore(for: "999"))
        XCTAssertEqual(battle.sides(for: "2P0LQ")?.player.first?.tag, "#2P0LQ")
    }

    func testUnknownClashRarityDoesNotInventCardLevel() throws {
        let card = try JSONDecoder().decode(ClashCard.self, from: Data(#"{"id":1,"name":"Card","level":1,"maxLevel":8,"rarity":"future"}"#.utf8))
        XCTAssertNil(card.displayLevel)
        XCTAssertNil(card.displayMaxLevel)
    }

    func testClashHTTP560NotFoundHidesServerDetail() async throws {
        let (url, session, id) = fixture(#"{"status":"error","errorData":{"code":"CLASH_API_404","message":"internal detail"},"errorMessage":"private"}"#, status: 560)
        defer { StubURLProtocol.remove(id) }
        do {
            _ = try await ClashRoyaleClient(baseURL: url, session: session).profile(tag: PlayerTag("2P0LQ"))
            XCTFail("Expected not found")
        } catch let error as GameClientError {
            XCTAssertEqual(error, .serverStatus(statusCode: 404))
            XCTAssertFalse(error.localizedDescription.contains("private"))
        }
    }

    func testGameClientsRejectWrongPlayer() async throws {
        let (url, session, id) = fixture(brawl.replacingOccurrences(of: "#2P0LQ", with: "#222"))
        defer { StubURLProtocol.remove(id) }
        do {
            _ = try await BrawlStarsClient(baseURL: url, session: session).profile(tag: PlayerTag("2P0LQ"))
            XCTFail("Expected tag mismatch")
        } catch let error as GameClientError { XCTAssertEqual(error, .tagMismatch) }
        let (clashURL, clashSession, clashID) = fixture(clash.replacingOccurrences(of: "#2P0LQ", with: "#222"))
        defer { StubURLProtocol.remove(clashID) }
        do {
            _ = try await ClashRoyaleClient(baseURL: clashURL, session: clashSession).profile(tag: PlayerTag("2P0LQ"))
            XCTFail("Expected tag mismatch")
        } catch let error as GameClientError { XCTAssertEqual(error, .tagMismatch) }
    }

    func testGameCancellationIsPreserved() async throws {
        let (url, session, id) = fixture(.cancelled); defer { StubURLProtocol.remove(id) }
        do {
            _ = try await BrawlStarsClient(baseURL: url, session: session).profile(tag: PlayerTag("2P0LQ"))
            XCTFail("Expected cancellation")
        } catch is CancellationError {} catch { XCTFail("Unexpected \(error)") }
        do {
            _ = try await ClashRoyaleClient(baseURL: url, session: session).profile(tag: PlayerTag("2P0LQ"))
            XCTFail("Expected cancellation")
        } catch is CancellationError {} catch { XCTFail("Unexpected \(error)") }
    }

    func testClashRejectsHTTPFailureEvenWithSuccessEnvelope() async throws {
        let (url, session, id) = fixture(clash, status: 503); defer { StubURLProtocol.remove(id) }
        do {
            _ = try await ClashRoyaleClient(baseURL: url, session: session).profile(tag: PlayerTag("2P0LQ"))
            XCTFail("Expected HTTP failure")
        } catch let error as GameClientError { XCTAssertEqual(error, .serverStatus(statusCode: 503)) }
    }
}
