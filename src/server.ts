import path from "path";
import addon from "./addon";
import express from "express";
import bodyParser from "body-parser";
import manifest from "./manifest";
import { StremioAPIClient } from "./utils/stremio";
import { backfillFromStremioToTrakt } from "./utils/sync";

const app = express();

const urlencodedParser = bodyParser.urlencoded({ extended: false });
const host =
  process.env.NODE_ENV !== "dev"
    ? "56bca7d190fc-simkl-stremio.baby-beamup.club"
    : "localhost:7000";

app.get("/configure", (_, res) => {
  res.sendFile(path.join(__dirname, "./public/index.html"));
});

app.use(addon);
let routerStack = app._router.stack[app._router.stack.length - 1];

routerStack.handle.stack = routerStack.handle.stack.filter((x: any) => {
  if (x.route && x.route.path === "/manifest.json") {
    return false;
  }
  return true;
});

const createLog = (req: any, res: any, next: any) => {
  res.on("finish", function () {
    console.log(
      req.method,
      decodeURI(req.url),
      res.statusCode,
      res.statusMessage,
    );
  });
  next();
};

app.get("/", (req: any, res: any) => {
  res.redirect(`stremio://${host}/manifest.json`);
});

app.get("/manifest.json", (req: any, res: any) => {
  res.send({
    ...manifest,
    behaviorHints: {
      configurable: true,
      configurationRequired: true,
    },
  });
});

app.get("/:config/configure", (req: any, res: any) => {
  res.sendFile(path.join(__dirname, "./public/index.html"));
});

app.get("/:config/manifest.json", (req: any, res: any) => {
  res.send({
    ...manifest,
    version: manifest.version,
    behaviorHints: {
      configurable: true,
      configurationRequired: false,
    },
  });
});

app.get("/:config(*)/meta/:type/:id.json", (req: any, res: any) => {
  // console.log(req.params.config);
});

app.get("/:config(*)/stream/:type/:id.json", (req: any, res: any) => {
  res.send({
    streams: [],
  });
});

export const startSync = async (
  userConfig: Record<string, string>,
  protocol: string,
) => {
  try {
    let { authKey } = await backfillFromStremioToTrakt(
      userConfig["stremio_authkey"],
      userConfig["trakt_accesstoken"],
      userConfig["trakt_clientid"],
      false,
    );
    console.log("Sync Completed");
    if (authKey && authKey !== userConfig["stremio_authkey"]) {
      userConfig["stremio_authkey"] = authKey;
      await StremioAPIClient.updateAddonCollection(authKey, manifest.id, {
        transportUrl: `${protocol}://${host}/${Object.entries(userConfig)
          .map((value) => value.join("-=-"))
          .join("|")}/manifest.json`,
      });
    }
  } catch (e) {
    console.log(e);
  }
};

app.get(
  "/:config(*)/subtitles/:type/:id/:rest(*)",
  async (req: any, res: any) => {
    res.send({
      subtitles: [],
    });
  },
);

app.use(createLog);

app.post("/configure/submit", urlencodedParser, async (req: any, res: any) => {
  const protocol = req.protocol;
  res.send(200);
  await startSync(
    {
      stremio_authkey: req.body.stremio_authkey,
      trakt_accesstoken: req.body.trakt_accesstoken,
      trakt_clientid: req.body.trakt_clientid,
    },
    protocol,
  );
});

app.use("/public", express.static("public"));
app.listen(process.env.PORT || 7000);
