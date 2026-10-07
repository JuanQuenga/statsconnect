import { Dialog } from "@base-ui/react/dialog";
import { CircleHelp, X } from "lucide-react";

/**
 * "Where is my player tag?" opens a centred dialog with the in-game walkthrough
 * GIF. It sits over the page rather than expanding inline, so nothing below
 * the search moves when it opens, and it fits any screen. The GIF always
 * animates: the motion is the instruction, so a still frame would not answer
 * the question.
 */
export function PlayerTagGuide() {
  return (
    <Dialog.Root>
      <Dialog.Trigger className="cr-tag-guide-trigger">
        <CircleHelp size={16} aria-hidden="true" />
        Where is my player tag?
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="cr-tag-guide-backdrop" />
        <Dialog.Popup className="cr-tag-guide">
          <header>
            <Dialog.Title className="cr-tag-guide-title">Find your player tag</Dialog.Title>
            <Dialog.Close className="cr-tag-guide-close" aria-label="Close">
              <X size={18} aria-hidden="true" />
            </Dialog.Close>
          </header>
          <img
            src="/images/animated/hashtag.gif"
            alt="Opening a Clash Royale profile from the main screen and copying the player tag shown under the name"
            width={720}
            height={720}
          />
          <Dialog.Description className="cr-tag-guide-copy">
            Tap your name at the top of the main screen to open your profile, then tap the tag under your name to copy it. Tags start with <strong>#</strong>.
          </Dialog.Description>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
