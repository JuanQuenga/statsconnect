import Foundation

enum AppConfiguration {
    private static let productionBackendURL: URL = {
        guard
            let components = URLComponents(string: "https://capable-guineapig-391.convex.cloud"),
            let url = components.url
        else {
            preconditionFailure("The production StatsConnect backend URL must be valid.")
        }
        return url
    }()

    static var backendURL: URL {
        guard
            let value = Bundle.main.object(forInfoDictionaryKey: "StatsConnectBackendURL") as? String,
            let components = URLComponents(string: value),
            components.scheme?.lowercased() == "https",
            let host = components.host,
            !host.isEmpty,
            components.user == nil,
            components.password == nil,
            let url = components.url
        else {
            return productionBackendURL
        }

        return url
    }
}
