import { create } from "zustand";
import { loadStringFromStorage, saveStringToStorage } from "@/lib/storage";
import {
  DEFAULT_THEME_SCHEME_ID,
  THEME_SCHEMES,
  applyThemeSchemeToDocument,
} from "@/lib/themeSchemes";

const THEME_SCHEME_KEY = "theme_scheme";
const THEME_IDS = THEME_SCHEMES.map((scheme) => scheme.id);

function loadThemeSchemeId() {
  return loadStringFromStorage(THEME_SCHEME_KEY, THEME_IDS, DEFAULT_THEME_SCHEME_ID);
}

interface ThemeState {
  schemeId: string;
  setSchemeId: (schemeId: string) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  schemeId: loadThemeSchemeId(),
  setSchemeId: (schemeId) => {
    saveStringToStorage(THEME_SCHEME_KEY, schemeId);
    applyThemeSchemeToDocument(schemeId);
    set({ schemeId });
  },
}));
