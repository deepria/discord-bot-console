import { createRouter, createWebHistory } from "vue-router";
import OperationsView from "../views/OperationsView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "ops-overview", component: OperationsView },
    {
      path: "/investigate",
      name: "ops-investigate",
      component: OperationsView,
    },
    { path: "/settings", name: "ops-settings", component: OperationsView },
    { path: "/legacy", redirect: { name: "ops-overview" } },
  ],
});
