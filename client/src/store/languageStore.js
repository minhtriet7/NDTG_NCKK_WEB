import { useAppStore } from "./appStore.js";

export function useLanguageStore(selector) {
  const store = useAppStore();
  const state = {
    lang: store.lang,
    setLanguage: store.setLang,
    toggleLanguage: store.toggleLang,
  };
  return typeof selector === "function" ? selector(state) : state;
}

useLanguageStore.getState = () => {
  const store = useAppStore.getState();
  return {
    lang: store.lang,
    setLanguage: store.setLang,
    toggleLanguage: store.toggleLang,
  };
};

useLanguageStore.setState = (partial) => {
  const store = useAppStore.getState();
  const current = {
    lang: store.lang,
    setLanguage: store.setLang,
    toggleLanguage: store.toggleLang,
  };
  const next = typeof partial === "function" ? partial(current) : partial;
  if (next && next.lang) {
    store.setLang(next.lang);
  }
};