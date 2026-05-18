type ExportResult = {
  source: "d1";
  status: "not_configured";
  message: string;
};

export function describeD1Export(): ExportResult {
  return {
    source: "d1",
    status: "not_configured",
    message: "Phase 1B will export the legacy D1 reference data into Firestore import documents."
  };
}

console.log(JSON.stringify(describeD1Export(), null, 2));
