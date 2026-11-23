import "@fontsource/jua/400.css";
import "./styles/base.css";
import "./styles/home.css";
import "./styles/lesson.css";
import { startApp } from "./app/shell.js";
import { setupPwa } from "./app/pwa.js";

startApp(document.getElementById("app"));
setupPwa();
