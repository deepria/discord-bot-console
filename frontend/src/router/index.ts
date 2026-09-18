import { createRouter, createWebHistory } from "vue-router";
import CommandDeckView from "../views/CommandDeckView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "command-deck",
      component: CommandDeckView,
    },
  ],
});
