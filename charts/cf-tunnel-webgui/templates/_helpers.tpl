{{/* cf-tunnel-webgui helpers. Deployed per workspace by paas-operator as svc-{ref[:8]}. */}}
{{- define "cftw.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- define "cftw.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}
{{- define "cftw.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- define "cftw.selectorLabels" -}}
app.kubernetes.io/name: {{ include "cftw.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}
{{- define "cftw.labels" -}}
helm.sh/chart: {{ include "cftw.chart" . }}
{{ include "cftw.selectorLabels" . }}
app.kubernetes.io/component: cf-tunnel-webgui
app.kubernetes.io/part-of: cf-tunnel-webgui
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
{{- end -}}
{{- define "cftw.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "cftw.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}
{{- define "cftw.secretName" -}}
{{- if .Values.auth.existingSecret -}}
{{- .Values.auth.existingSecret -}}
{{- else -}}
{{- printf "%s-secret" (include "cftw.fullname" .) -}}
{{- end -}}
{{- end -}}
{{- define "cftw.pvcName" -}}
{{- if .Values.persistence.existingClaim -}}
{{- .Values.persistence.existingClaim -}}
{{- else -}}
{{- printf "%s-data" (include "cftw.fullname" .) -}}
{{- end -}}
{{- end -}}
{{- define "cftw.authProxyConfigMapName" -}}
{{- printf "%s-authproxy" (include "cftw.fullname" .) -}}
{{- end -}}
{{/* explicit value wins; else the live Secret's value (stable across upgrades); else generate. */}}
{{- define "cftw.resolveSecretValue" -}}
{{- $ctx := .ctx -}}
{{- $val := .explicit -}}
{{- if not $val -}}
  {{- $live := lookup "v1" "Secret" $ctx.Release.Namespace (include "cftw.secretName" $ctx) -}}
  {{- if $live -}}
    {{- with $live.data -}}
      {{- with (index . $.key) -}}
        {{- $val = . | b64dec -}}
      {{- end -}}
    {{- end -}}
  {{- end -}}
{{- end -}}
{{- if not $val -}}
  {{- $val = randAlphaNum 24 -}}
{{- end -}}
{{- $val -}}
{{- end -}}
{{/* imagePullSecrets from both the top-level list and global (strings or {name}). */}}
{{- define "cftw.imagePullSecrets" -}}
{{- $names := list -}}
{{- range (concat (.Values.imagePullSecrets | default list) (.Values.global.imagePullSecrets | default list)) -}}
  {{- $n := "" -}}
  {{- if kindIs "map" . -}}{{- $n = .name -}}{{- else -}}{{- $n = . -}}{{- end -}}
  {{- if and $n (not (has $n $names)) -}}{{- $names = append $names $n -}}{{- end -}}
{{- end -}}
{{- range $names }}
- name: {{ . }}
{{- end -}}
{{- end -}}
