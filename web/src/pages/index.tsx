// Written with AI assistance (Claude Code)
// Which component draws each page.
import { lazy, type ComponentType } from "react";
import type { PageId } from "../router/routes";
const AskPage = lazy(() => import("./AskPage").then((m) => ({ default: m.AskPage })));
const HabitatsPage = lazy(() => import("./HabitatsPage").then((m) => ({ default: m.HabitatsPage })));
import { HomePage } from "./HomePage";
const MethodPage = lazy(() => import("./MethodPage").then((m) => ({ default: m.MethodPage })));
import { MissingPage } from "./MissingPage";
const ModelPage = lazy(() => import("./ModelPage").then((m) => ({ default: m.ModelPage })));
const ResearchPage = lazy(() => import("./ResearchPage").then((m) => ({ default: m.ResearchPage })));
const StoryPage = lazy(() => import("./StoryPage").then((m) => ({ default: m.StoryPage })));

export const PAGE_VIEWS: Record<PageId, ComponentType> = {
  home: HomePage,
  story: StoryPage,
  habitats: HabitatsPage,
  ask: AskPage,
  research: ResearchPage,
  model: ModelPage,
  method: MethodPage,
  missing: MissingPage,
};

