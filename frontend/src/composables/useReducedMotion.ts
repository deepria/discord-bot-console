import { onMounted, onUnmounted, ref, type Ref } from "vue";

export function useReducedMotion(): Ref<boolean> {
  const reduced = ref(false);
  let query: MediaQueryList | null = null;
  const update = () => {
    reduced.value = query?.matches ?? false;
  };
  onMounted(() => {
    query = window.matchMedia("(prefers-reduced-motion: reduce)");
    update();
    query.addEventListener("change", update);
  });
  onUnmounted(() => query?.removeEventListener("change", update));
  return reduced;
}
