import React from "react";
import ReactDOM from "react-dom/client";
import MobileHomeCarousel from "./MobileHomeCarousel";
import { installScrollEdges } from "./scrollEdges";
import "./scrollEdges.css";

installScrollEdges();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <MobileHomeCarousel />
  </React.StrictMode>
);
