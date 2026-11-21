#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { diagnosticSources as sources } from "../packages/shared/src/diagnostic-sources.gen.ts";
import {
  diagnosticMessages,
  diagnosticOperations,
} from "../packages/shared/src/diagnostics.ts";

const root = fileURLToPath(new URL("../", import.meta.url));

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const locationsPattern = `^(${Object.keys(sources).map(escapeRegex).join("|")}):[1-9][0-9]{0,6}:[1-9][0-9]{0,3}$`;

const dict = Object.entries(diagnosticMessages)
  .flatMap(([key, value]) => [JSON.stringify(key), JSON.stringify(value)])
  .join(" ");

const lineLimits = Object.entries(sources)
  .flatMap(([key, value]) => [JSON.stringify(key), value])
  .join(" ");

const block = `{{- /* BEGIN GENERATED DIAGNOSTICS: scripts/generate-diagnostics.mjs */ -}}
  {{- $messages := dict ${dict} -}}
  {{- $operationValid := regexMatch ${JSON.stringify(`^(${diagnosticOperations.map(escapeRegex).join("|")})$`)} (toString .diagnosticOperation) -}}
  {{- if $operationValid -}}{{- $_ := set $o "operation" .diagnosticOperation -}}{{- end -}}
  {{- if and (hasKey $messages (toString .diagnosticCode)) $operationValid -}}
    {{- $_ := set $o "errorCode" .diagnosticCode -}}
    {{- $_ := set $o "operation" .diagnosticOperation -}}
    {{- $_ := set $o "diagnosticMessage" (get $messages .diagnosticCode) -}}
    {{- $locations := list -}}
    {{- $limits := dict ${lineLimits} -}}
    {{- $inputLocations := .diagnosticLocations -}}
    {{- if kindIs "string" $inputLocations -}}{{- $inputLocations = fromJson $inputLocations -}}{{- end -}}
    {{- if kindIs "slice" $inputLocations -}}
      {{- range $inputLocations -}}
        {{- if and (lt (len $locations) 3) (regexMatch ${JSON.stringify(locationsPattern)} (toString .)) -}}
          {{- $parts := splitList ":" . -}}
          {{- if and (le (atoi (index $parts 1)) (get $limits (index $parts 0))) (le (atoi (index $parts 2)) 4096) -}}
            {{- $locations = append $locations . -}}
          {{- end -}}
        {{- end -}}
      {{- end -}}
    {{- end -}}
    {{- $_ := set $o "locations" $locations -}}
  {{- end -}}
  {{- /* END GENERATED DIAGNOSTICS */ -}}`;

const path = join(root, "deploy/observability/config.alloy");

const config = await readFile(path, "utf8");

const marker =
  /\{\{- \/\* BEGIN GENERATED DIAGNOSTICS[\s\S]*?\{\{- \/\* END GENERATED DIAGNOSTICS \*\/ -\}\}/;

if (!marker.test(config)) {
  throw Error("Missing Alloy diagnostics marker");
}

await writeFile(
  path,
  config.replace(marker, () => block),
);

console.log(
  `Generated diagnostic source/collector contract (${Object.keys(sources).length} owned source files).`,
);
