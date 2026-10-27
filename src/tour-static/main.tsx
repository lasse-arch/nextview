import { createRoot } from "react-dom/client";
import { Experience } from "@/app/arpo/tour-lab/[slug]/experience";

/*
 * A published tour as plain files (see scripts/build-tour-engine.mjs): the
 * same engine as /t/<slug>, started in the browser with the tour's data from
 * the page itself - no server behind it.
 */
const data = JSON.parse(document.getElementById("tour-data")!.textContent!);
createRoot(document.getElementById("tour")!).render(<Experience {...data} phone={/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)} />);
