const axios = require("axios");
const {
  DOCTOR_SPECIALTIES,
  DEFAULT_DOCTOR_SPECIALTY,
  resolveDoctorSpecialty
} = require("../constants/doctorSpecialties");

const DEFAULT_DISCLAIMER = "This is not a medical diagnosis. Seek professional medical advice.";
const DEFAULT_SPECIALTY = DEFAULT_DOCTOR_SPECIALTY;
const MAX_ADVICE_LENGTH = 280;

const normalizeUrgency = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (["low", "medium", "high"].includes(normalized)) {
    return normalized;
  }
  return "medium";
};

const normalizeConcerns = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .map((item) => {
      const lowered = item.toLowerCase();
      if (lowered.startsWith("possible ") || lowered.startsWith("may ") || lowered.startsWith("could ")) {
        return item;
      }
      return `Possible ${item.charAt(0).toLowerCase()}${item.slice(1)}`;
    })
    .slice(0, 5);
};

const normalizeSpecialty = (value) => {
  return resolveDoctorSpecialty(value) || DEFAULT_SPECIALTY;
};

const normalizeAdvice = (value) => {
  const text = String(value || "").trim() || "Symptoms may need medical assessment. Rest, hydrate, and consult a doctor if symptoms persist or worsen.";
  return text.slice(0, MAX_ADVICE_LENGTH);
};

const extractTextFromResponse = (data) => {
  if (typeof data?.text === "string" && data.text.trim()) {
    return data.text;
  }

  const content = data?.message?.content;
  if (Array.isArray(content)) {
    const textBlock = content.find((item) => item && item.type === "text" && typeof item.text === "string");
    if (textBlock && textBlock.text.trim()) {
      return textBlock.text;
    }
  }

  if (Array.isArray(data?.generations) && data.generations[0]?.text) {
    return String(data.generations[0].text);
  }

  return "";
};

const extractJsonBlock = (text) => {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Model output did not contain valid JSON object");
  }

  return text.slice(firstBrace, lastBrace + 1);
};

const buildPrompt = ({ symptoms, age, gender, duration, severity, notes }) => {
  const allowedSpecialtiesText = DOCTOR_SPECIALTIES.map((specialty) => `- ${specialty}`).join("\n");

  return [
    "You are a medical assistant AI. Based on the given symptoms, provide safe, non-diagnostic guidance.",
    "",
    "Rules:",
    "- Do NOT provide a diagnosis",
    "- Only suggest possible concerns",
    "- Use cautious language",
    "- Always include a disclaimer",
    "- Keep response short and clear",
    "- Do not return markdown or extra text",
    "- recommendedSpecialty MUST be exactly one value from the allowed list below",
    "",
    "Allowed doctor specialties:",
    allowedSpecialtiesText,
    "",
    "Respond ONLY in valid JSON format:",
    "{",
    '  "possibleConcerns": [],',
    '  "urgency": "",',
    '  "recommendedSpecialty": "",',
    '  "advice": "",',
    `  "disclaimer": "${DEFAULT_DISCLAIMER}"`,
    "}",
    "",
    `Symptoms: ${String(symptoms || "")}`,
    `Age: ${age ?? ""}`,
    `Gender: ${String(gender || "")}`,
    `Duration: ${String(duration || "")}`,
    `Severity: ${String(severity || "")}`,
    `Notes: ${String(notes || "")}`
  ].join("\n");
};

const generateSymptomAnalysis = async (payload) => {
  const apiKey = process.env.COHERE_API_KEY;
  const model = process.env.COHERE_MODEL || "command-a-03-2025";
  const timeout = Number(process.env.REQUEST_TIMEOUT_MS || 10000);

  if (!apiKey) {
    throw new Error("Missing COHERE_API_KEY");
  }

  const prompt = buildPrompt(payload);

  let response;
  try {
    response = await axios.post(
      "https://api.cohere.com/v2/chat",
      {
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 350
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        timeout
      }
    );
  } catch (error) {
    const status = error.response?.status || null;
    const upstreamMessage = error.response?.data?.message || error.message;
    const wrappedError = new Error(
      status ? `Cohere API error (${status}): ${upstreamMessage}` : `Cohere request failed: ${upstreamMessage}`
    );
    wrappedError.status = status;
    wrappedError.upstream = error.response?.data || null;
    throw wrappedError;
  }

  const rawText = extractTextFromResponse(response.data);
  const jsonText = extractJsonBlock(rawText);
  const parsed = JSON.parse(jsonText);

  return {
    possibleConcerns: normalizeConcerns(parsed.possibleConcerns),
    recommendedSpecialty: normalizeSpecialty(parsed.recommendedSpecialty),
    advice: normalizeAdvice(parsed.advice),
    urgency: normalizeUrgency(parsed.urgency),
    disclaimer: String(parsed.disclaimer || DEFAULT_DISCLAIMER).trim() || DEFAULT_DISCLAIMER,
    rawResponse: rawText
  };
};

module.exports = {
  DEFAULT_DISCLAIMER,
  DEFAULT_SPECIALTY,
  generateSymptomAnalysis
};
