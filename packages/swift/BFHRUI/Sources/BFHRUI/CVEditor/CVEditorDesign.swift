#if DEBUG
import BFHRCore
import Foundation

extension DesignScenario {
    /// The CV editor in this scenario. Populated opens the default base CV (`cv-en`); empty has no
    /// CVs, so nothing is selected and the list shows the `ChoiceCards` empty state.
    public func cvEditorModel() -> CVEditorModel {
        let data = self.data
        let active = data.cvs.filter { $0.archivedAt == nil }
        let selected = data.profile?.defaultCvId.flatMap { id in active.first { $0.id == id } }
            ?? active.first { $0.isDefault }
            ?? active.filter { $0.parentCvId == nil }.min { $0.id < $1.id }
        let model = CVEditorModel(selectedCvId: selected?.id, now: now)
        apply(to: model)
        return model
    }
}
#endif
