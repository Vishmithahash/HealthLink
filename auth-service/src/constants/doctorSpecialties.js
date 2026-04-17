const DOCTOR_SPECIALTIES = [
  "General Physician (General Practitioner)",
  "Cardiologist",
  "Dermatologist",
  "Neurologist",
  "Orthopedic",
  "Pediatrician",
  "Gynecologist (OB-GYN)",
  "Psychiatrist",
  "ENT Specialist (Otolaryngologist)",
  "Ophthalmologist",
  "Pulmonologist",
  "Gastroenterologist",
  "Endocrinologist",
  "Nephrologist",
  "Urologist",
  "Allergist / Immunologist",
  "Infectious Disease Specialist",
  "Hematologist",
  "Oncologist",
  "Rheumatologist",
  "General Surgeon",
  "Neurosurgeon",
  "Plastic Surgeon",
  "Anesthesiologist",
  "Radiologist",
  "Pathologist",
  "Emergency Medicine Specialist"
];

const DEFAULT_DOCTOR_SPECIALTY = DOCTOR_SPECIALTIES[0];

const normalizeSpecialtyKey = (value) => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "");

const DOCTOR_SPECIALTY_LOOKUP = DOCTOR_SPECIALTIES.reduce((acc, specialty) => {
  acc[normalizeSpecialtyKey(specialty)] = specialty;
  return acc;
}, {});

const SPECIALTY_ALIASES = {
  generalphysician: DEFAULT_DOCTOR_SPECIALTY,
  generalpractitioner: DEFAULT_DOCTOR_SPECIALTY,
  gp: DEFAULT_DOCTOR_SPECIALTY,
  primarycarephysician: DEFAULT_DOCTOR_SPECIALTY,
  familyphysician: DEFAULT_DOCTOR_SPECIALTY,
  familymedicine: DEFAULT_DOCTOR_SPECIALTY,
  gynecologist: "Gynecologist (OB-GYN)",
  gynaecologist: "Gynecologist (OB-GYN)",
  obgyn: "Gynecologist (OB-GYN)",
  obstetrician: "Gynecologist (OB-GYN)",
  entspecialist: "ENT Specialist (Otolaryngologist)",
  ent: "ENT Specialist (Otolaryngologist)",
  otolaryngologist: "ENT Specialist (Otolaryngologist)",
  orthopedist: "Orthopedic",
  emergencymedicine: "Emergency Medicine Specialist",
  emergencyphysician: "Emergency Medicine Specialist"
};

Object.keys(SPECIALTY_ALIASES).forEach((key) => {
  DOCTOR_SPECIALTY_LOOKUP[key] = SPECIALTY_ALIASES[key];
});

const resolveDoctorSpecialty = (value) => {
  const key = normalizeSpecialtyKey(value);
  if (!key) {
    return null;
  }

  return DOCTOR_SPECIALTY_LOOKUP[key] || null;
};

module.exports = {
  DOCTOR_SPECIALTIES,
  DEFAULT_DOCTOR_SPECIALTY,
  resolveDoctorSpecialty
};
