import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { GameId } from "@/lib/contracts";

type AmbientContextValue = {
  ambient: GameId | null;
  lightStage: (game: GameId) => void;
};

const AmbientContext = createContext<AmbientContextValue | null>(null);

/**
 * Holds the game whose accent currently floods the console backdrop. Focusing
 * or hovering a game tile relights the whole stage in that game's colour; the
 * stage keeps the last colour rather than snapping back to neutral on blur.
 */
export function AmbientProvider({ children }: { children: ReactNode }) {
  const [ambient, setAmbient] = useState<GameId | null>(null);
  const lightStage = useCallback((game: GameId) => setAmbient(game), []);
  const value = useMemo(() => ({ ambient, lightStage }), [ambient, lightStage]);
  return (
    <AmbientContext.Provider value={value}>{children}</AmbientContext.Provider>
  );
}

export function useAmbient(): AmbientContextValue {
  const value = useContext(AmbientContext);
  if (!value) {
    throw new Error("useAmbient must be used inside an AmbientProvider");
  }
  return value;
}

/** Props to spread on any element that should relight the stage. */
export function useStageLight(game: GameId) {
  const { lightStage } = useAmbient();
  const relight = useCallback(() => lightStage(game), [game, lightStage]);
  return { onFocus: relight, onPointerEnter: relight };
}
