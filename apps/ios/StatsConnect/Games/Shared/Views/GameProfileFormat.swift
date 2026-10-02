import Foundation

enum GameProfileFormat {
    static func cacheDate(milliseconds: Double) -> Date? {
        guard milliseconds.isFinite, milliseconds > 0 else { return nil }
        return Date(timeIntervalSince1970: milliseconds / 1_000)
    }

    static func number(_ value: Int?) -> String? {
        value.map { $0.formatted(.number) }
    }

    static func trophyChange(_ value: Int?) -> String? {
        guard let value else {
            return nil
        }
        let formatted = value.formatted(.number)
        return value > 0 ? "+\(formatted)" : formatted
    }

    static func battleDate(_ value: String?) -> String? {
        guard let value, !value.isEmpty else {
            return nil
        }

        let patterns = [
            "yyyyMMdd'T'HHmmss.SSS'Z'",
            "yyyyMMdd'T'HHmmss'Z'",
            "yyyy-MM-dd'T'HH:mm:ss.SSSXXXXX",
            "yyyy-MM-dd'T'HH:mm:ssXXXXX"
        ]

        for pattern in patterns {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = TimeZone(secondsFromGMT: 0)
            formatter.dateFormat = pattern
            if let date = formatter.date(from: value) {
                return date.formatted(date: .abbreviated, time: .shortened)
            }
        }

        return value
    }
}
