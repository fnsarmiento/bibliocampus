import { createApp } from "./app.js";

const port = Number(process.env.PORT || 3000);
const frontendUrl = process.env.FRONTEND_URL;

const app = createApp(frontendUrl);

app.listen(port, () => {
  console.log(`BiblioCampus backend listening on port ${port}`);
});
