import { setGlobalOptions } from "firebase-functions/v2";

// Same region as Firestore (default) and the Storage bucket. maxInstances caps the cost of abuse
// (e.g. a flood of unauthenticated sign-in requests) for every function in the codebase.
setGlobalOptions({ region: "europe-west1", maxInstances: 10 });
