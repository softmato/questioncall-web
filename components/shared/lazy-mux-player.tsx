"use client";

import dynamic from "next/dynamic";

// The Mux player (hls.js + media-chrome) is the heaviest client code in the
// app; it loads only once a video is actually on screen.
export const MuxPlayer = dynamic(() => import("@mux/mux-player-react"), { ssr: false });
