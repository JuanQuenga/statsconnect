import Foundation
import Observation

@MainActor
@Observable
public final class SavedProfilesStore {
    private static let profilesKey = "savedProfiles"
    private static let viewerIDKey = "viewerID"

    public private(set) var savedProfiles: [ProfileResult] = []
    public let viewerID: String
    public private(set) var lastError: String?

    private let defaults: UserDefaults

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults

        if let existing = defaults.string(forKey: Self.viewerIDKey), UUID(uuidString: existing) != nil {
            viewerID = existing
        } else {
            let fresh = UUID().uuidString
            defaults.set(fresh, forKey: Self.viewerIDKey)
            viewerID = fresh
        }

        loadProfiles()
    }

    public func save(_ result: ProfileResult) -> Bool {
        var next = savedProfiles
        let id = result.data.id
        next.removeAll { $0.data.id == id }
        next.insert(result, at: 0)

        guard persist(next) else { return false }
        savedProfiles = next
        return true
    }

    public func remove(id: String) -> Bool {
        let originalCount = savedProfiles.count
        let next = savedProfiles.filter { $0.data.id != id }
        guard next.count != originalCount else { return false }
        guard persist(next) else { return false }
        savedProfiles = next
        return true
    }

    public func contains(_ summary: ProfileSummary) -> Bool {
        savedProfiles.contains { $0.data.id == summary.id }
    }

    private func loadProfiles() {
        guard defaults.object(forKey: Self.profilesKey) != nil else { return }
        guard let data = defaults.data(forKey: Self.profilesKey) else {
            lastError = "Saved profiles are stored in an incompatible format and couldn't be loaded."
            return
        }
        do {
            let decoded = try JSONDecoder().decode([ProfileResult].self, from: data)
            savedProfiles = decoded
        } catch {
            savedProfiles = []
            lastError = "Saved profiles couldn't be loaded."
        }
    }

    private func persist(_ profiles: [ProfileResult]) -> Bool {
        do {
            let data = try JSONEncoder().encode(profiles)
            defaults.set(data, forKey: Self.profilesKey)
            lastError = nil
            return true
        } catch {
            lastError = "Couldn't save the profile. Please try again."
            return false
        }
    }
}
