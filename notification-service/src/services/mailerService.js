const nodemailer = require("nodemailer");
const env = require("../config/env");

const buildTransportOptions = ({ user, pass }) => {
  if (env.smtpHost) {
    return {
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth: {
        user,
        pass
      }
    };
  }

  return {
    service: env.emailService,
    auth: {
      user,
      pass
    }
  };
};

const primaryTransporter = nodemailer.createTransport(
  buildTransportOptions({
    user: env.emailUser,
    pass: env.emailPass
  })
);

const hasFallback = Boolean(env.emailUserFallback && env.emailPassFallback);
const fallbackTransporter = hasFallback
  ? nodemailer.createTransport(
      buildTransportOptions({
        user: env.emailUserFallback,
        pass: env.emailPassFallback
      })
    )
  : null;

const canFallback = (error) => {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("sending limit") || message.includes("quota") || message.includes("rate limit");
};

const verifyConnection = async () => {
  await primaryTransporter.verify();

  if (fallbackTransporter) {
    await fallbackTransporter.verify();
  }
};

const sendEmail = async (to, subject, html) => {
  try {
    const info = await primaryTransporter.sendMail({
      from: env.emailFrom,
      to,
      subject,
      html
    });

    return {
      ...info,
      sender: env.emailUser
    };
  } catch (error) {
    if (!fallbackTransporter || !canFallback(error)) {
      throw error;
    }

    const info = await fallbackTransporter.sendMail({
      from: env.emailFromFallback || env.emailFrom,
      to,
      subject,
      html
    });

    return {
      ...info,
      sender: env.emailUserFallback
    };
  }
};

module.exports = {
  sendEmail,
  verifyConnection
};
