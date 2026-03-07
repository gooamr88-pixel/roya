// ═══════════════════════════════════════════════
// Auth Pages JavaScript
// ═══════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {
  initLoginForm();
  initRegisterForm();
  initOTPInputs();
  initResetPassword();
});

// ── Toggle Password Visibility ──
function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  const icon = btn.querySelector("i");
  if (input.type === "password") {
    input.type = "text";
    icon.className = "fas fa-eye-slash";
  } else {
    input.type = "password";
    icon.className = "fas fa-eye";
  }
}

// ── Login Form ──
function initLoginForm() {
  const form = document.getElementById("loginForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("loginBtn");
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const rememberMe = document.getElementById("remember")?.checked || false;

    if (!email || !password) {
      Toast.warning(
        i18n.t("Please fill in all fields.", "يرجى ملء جميع الحقول."),
      );
      return;
    }

    setLoading(btn, true);

    try {
      const data = await API.post(
        "/auth/login",
        { email, password, rememberMe },
        { skipAuthRefresh: true },
      );
      Toast.success(
        i18n.t(
          "Login successful! Redirecting...",
          "تم تسجيل الدخول! جارٍ التحويل...",
        ),
      );

      const role = data.data?.user?.role;
      setTimeout(() => {
        if (["super_admin", "admin", "supervisor"].includes(role)) {
          window.location.href = "/admin";
        } else {
          window.location.href = "/dashboard";
        }
      }, 1000);
    } catch (err) {
      Toast.error(err.message);
    } finally {
      setLoading(btn, false);
    }
  });
}
// ── Registration ──
let registeredEmail = "";
let phoneInput = null;
let otpTimerInterval = null; // Tracks current OTP countdown — prevents duplicate intervals

function initRegisterForm() {
  // Initialize intl-tel-input
  const phoneEl = document.getElementById("phone");
  if (phoneEl && typeof intlTelInput !== "undefined") {
    phoneInput = intlTelInput(phoneEl, {
      initialCountry: "sa",
      preferredCountries: [
        "sa",
        "eg",
        "ae",
        "kw",
        "qa",
        "bh",
        "om",
        "jo",
        "lb",
      ],
      separateDialCode: true,
      utilsScript:
        "https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.19/js/utils.js",
      customContainer: "w-full",
      nationalMode: true,
      autoInsertDialCode: true,
      formatOnDisplay: true,
    });
  }

  // Register form handler
  const form = document.getElementById("registerForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("registerBtn");
    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const confirm = document.getElementById("confirmPassword").value;

    // Get phone number
    let phone = "";
    if (phoneInput) {
      phone = phoneInput.getNumber();
      const phoneError = document.getElementById("phoneError");
      if (!phoneInput.isValidNumber()) {
        if (phoneError) phoneError.style.display = "block";
        if (typeof Toast !== "undefined")
          Toast.error(
            i18n.t(
              "Please enter a valid phone number",
              "يرجى إدخال رقم هاتف صحيح",
            ),
          );
        return;
      }
      if (phoneError) phoneError.style.display = "none";
    } else {
      phone = document.getElementById("phone").value.trim();
    }

    if (!name || !email || !phone || !password) {
      if (typeof Toast !== "undefined")
        Toast.warning(
          i18n.t(
            "Please fill all required fields",
            "يرجى ملء جميع الحقول المطلوبة",
          ),
        );
      return;
    }

    if (password !== confirm) {
      if (typeof Toast !== "undefined")
        Toast.error(
          i18n.t("Passwords do not match", "كلمات المرور غير متطابقة"),
        );
      return;
    }

    if (password.length < 8) {
      if (typeof Toast !== "undefined")
        Toast.error(
          i18n.t(
            "Password must be at least 8 characters",
            "يجب أن تكون كلمة المرور 8 أحرف على الأقل",
          ),
        );
      return;
    }

    setLoading(btn, true);

    try {
      await API.post(
        "/auth/register",
        { name, email, phone, password },
        { skipAuthRefresh: true },
      );
      registeredEmail = email;
      if (typeof Toast !== "undefined")
        Toast.success(
          i18n.t(
            "Account created! Check your email for the verification code.",
            "تم إنشاء الحساب! تحقق من بريدك الإلكتروني للحصول على رمز التحقق.",
          ),
        );

      // Switch to OTP step
      document.getElementById("step1").classList.add("hidden");
      document.getElementById("step2").classList.remove("hidden");
      document.getElementById("otpEmail").textContent = email;
      document.querySelectorAll(".auth-step")[1]?.classList.add("active");

      startOTPTimer();
      document.querySelector(".otp-input")?.focus();
    } catch (err) {
      if (typeof Toast !== "undefined") Toast.error(err.message);
    } finally {
      setLoading(btn, false);
    }
  });
}

// ── OTP Inputs ──
function initOTPInputs() {
  const container = document.getElementById("otpContainer");
  if (!container) return;

  const inputs = container.querySelectorAll(".otp-input");

  inputs.forEach((input, index) => {
    input.addEventListener("input", (e) => {
      const value = e.target.value;
      if (value && index < inputs.length - 1) {
        inputs[index + 1].focus();
      }
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !input.value && index > 0) {
        inputs[index - 1].focus();
      }
    });

    // Handle paste
    input.addEventListener("paste", (e) => {
      e.preventDefault();
      const pasted = e.clipboardData
        .getData("text")
        .replace(/\D/g, "")
        .slice(0, 6);
      pasted.split("").forEach((char, i) => {
        if (inputs[i]) inputs[i].value = char;
      });
      if (pasted.length > 0)
        inputs[Math.min(pasted.length, inputs.length - 1)].focus();
    });
  });

  // Verify OTP Form
  const otpForm = document.getElementById("otpForm");
  if (otpForm) {
    otpForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = document.getElementById("verifyBtn");
      const otp = Array.from(inputs)
        .map((i) => i.value)
        .join("");

      if (otp.length !== 6) {
        Toast.warning(
          i18n.t(
            "Please enter the complete 6-digit code.",
            "يرجى إدخال الرمز المكون من 6 أرقام كاملاً.",
          ),
        );
        return;
      }

      setLoading(btn, true);

      try {
        await API.post(
          "/auth/verify-otp",
          { email: registeredEmail, otp },
          { skipAuthRefresh: true },
        );
        Toast.success(
          i18n.t(
            "Email verified! Redirecting to login...",
            "تم التحقق من البريد! جارٍ التحويل لتسجيل الدخول...",
          ),
        );
        setTimeout(() => {
          window.location.href = "/login";
        }, 1500);
      } catch (err) {
        Toast.error(err.message);
      } finally {
        setLoading(btn, false);
      }
    });
  }

  // Resend OTP
  const resendBtn = document.getElementById("resendBtn");
  if (resendBtn) {
    resendBtn.addEventListener("click", async () => {
      try {
        await API.post(
          "/auth/resend-otp",
          { email: registeredEmail },
          { skipAuthRefresh: true },
        );
        Toast.success(i18n.t("New OTP sent!", "تم إرسال رمز تحقق جديد!"));
        startOTPTimer();
      } catch (err) {
        Toast.error(err.message);
      }
    });
  }
}

function startOTPTimer() {
  if (otpTimerInterval) clearInterval(otpTimerInterval); // Kill any previous countdown
  const timerEl = document.getElementById("timer");
  const resendBtn = document.getElementById("resendBtn");
  if (!timerEl || !resendBtn) return;
  let seconds = 60;

  resendBtn.disabled = true;
  timerEl.textContent = seconds;

  otpTimerInterval = setInterval(() => {
    seconds--;
    timerEl.textContent = seconds;

    if (seconds <= 0) {
      clearInterval(otpTimerInterval);
      otpTimerInterval = null;
      resendBtn.disabled = false;
      resendBtn.innerHTML = i18n.t(
        "Resend OTP",
        "\u0625\u0639\u0627\u062f\u0629 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0631\u0645\u0632",
      );
    }
  }, 1000);
}

// ── Reset Password ──
let resetEmailContext = "";
let resetOtpContext = "";
let resetTimerInterval = null;

function initResetPassword() {
  const requestForm = document.getElementById("resetRequestForm");
  if (!requestForm) return;

  // STEP 1: Request Form
  requestForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("resetRequestBtn");
    const email = document.getElementById("email").value.trim();

    setLoading(btn, true);
    try {
      await API.post(
        "/auth/forgot-password",
        { email },
        { skipAuthRefresh: true },
      );
      Toast.success(
        i18n.t(
          "If an account exists, a reset code has been sent.",
          "إذا كان الحساب موجوداً، فقد تم إرسال رمز إعادة التعيين.",
        ),
      );

      resetEmailContext = email;
      // Transition to Step 2
      document.getElementById("resetStep1").classList.add("hidden");
      document.getElementById("resetStep2").classList.remove("hidden");
      document.getElementById("resetOtpEmail").textContent = email;
      document
        .querySelectorAll("#resetSteps .auth-step")[1]
        ?.classList.add("active");

      startResetOTPTimer();
      document.querySelector("#resetOtpContainer .otp-input")?.focus();

      // Init OTP inputs for reset context
      initResetOTPInputs();
    } catch (err) {
      Toast.error(err.message);
    } finally {
      setLoading(btn, false);
    }
  });

  // STEP 3: New Password Form
  const newPassForm = document.getElementById("newPasswordForm");
  if (newPassForm) {
    newPassForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = document.getElementById("newPasswordBtn");
      const password = document.getElementById("newPass").value;
      const confirm = document.getElementById("confirmNewPass").value;

      if (password !== confirm) {
        Toast.error(
          i18n.t("Passwords do not match.", "كلمات المرور غير متطابقة."),
        );
        return;
      }

      setLoading(btn, true);
      try {
        // Pass email and otp collected from earlier steps
        await API.post(
          "/auth/reset-password",
          { email: resetEmailContext, otp: resetOtpContext, password },
          { skipAuthRefresh: true },
        );
        Toast.success(
          i18n.t(
            "Password reset! Redirecting to login...",
            "تم إعادة تعيين كلمة المرور! جارٍ التحويل لتسجيل الدخول...",
          ),
        );
        setTimeout(() => {
          window.location.href = "/login";
        }, 1500);
      } catch (err) {
        Toast.error(err.message);
      } finally {
        setLoading(btn, false);
      }
    });
  }

  // Resend Reset OTP
  const resendBtn = document.getElementById("resetResendBtn");
  if (resendBtn) {
    resendBtn.addEventListener("click", async () => {
      try {
        // Just calling forgot-password again will rotate the OTP safely
        await API.post(
          "/auth/forgot-password",
          { email: resetEmailContext },
          { skipAuthRefresh: true },
        );
        Toast.success(
          i18n.t("New reset code sent!", "تم إرسال رمز إعادة تعيين جديد!"),
        );
        startResetOTPTimer();
      } catch (err) {
        Toast.error(err.message);
      }
    });
  }
}

function initResetOTPInputs() {
  const container = document.getElementById("resetOtpContainer");
  if (!container) return;

  const inputs = container.querySelectorAll(".otp-input");

  inputs.forEach((input, index) => {
    input.addEventListener("input", (e) => {
      const value = e.target.value;
      if (value && index < inputs.length - 1) {
        inputs[index + 1].focus();
      }
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !input.value && index > 0) {
        inputs[index - 1].focus();
      }
    });

    input.addEventListener("paste", (e) => {
      e.preventDefault();
      const pasted = e.clipboardData
        .getData("text")
        .replace(/\D/g, "")
        .slice(0, 6);
      pasted.split("").forEach((char, i) => {
        if (inputs[i]) inputs[i].value = char;
      });
      if (pasted.length > 0)
        inputs[Math.min(pasted.length, inputs.length - 1)].focus();
    });
  });

  const otpForm = document.getElementById("resetOtpForm");
  if (otpForm) {
    otpForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const otp = Array.from(inputs)
        .map((i) => i.value)
        .join("");

      if (otp.length !== 6) {
        Toast.warning(
          i18n.t(
            "Please enter the complete 6-digit code.",
            "يرجى إدخال الرمز المكون من 6 أرقام كاملاً.",
          ),
        );
        return;
      }

      // Move to step 3 locally (validation happens on final reset submit)
      resetOtpContext = otp;

      document.getElementById("resetStep2").classList.add("hidden");
      document.getElementById("resetStep3").classList.remove("hidden");
      document
        .querySelectorAll("#resetSteps .auth-step")[2]
        ?.classList.add("active");
      document.getElementById("newPass")?.focus();
    });
  }
}

function startResetOTPTimer() {
  if (resetTimerInterval) clearInterval(resetTimerInterval);
  const timerEl = document.getElementById("resetTimer");
  const resendBtn = document.getElementById("resetResendBtn");
  if (!timerEl || !resendBtn) return;
  let seconds = 60;

  resendBtn.disabled = true;
  timerEl.textContent = seconds;

  resetTimerInterval = setInterval(() => {
    seconds--;
    timerEl.textContent = seconds;

    if (seconds <= 0) {
      clearInterval(resetTimerInterval);
      resetTimerInterval = null;
      resendBtn.disabled = false;
      resendBtn.innerHTML = i18n.t("Resend Code", "إعادة إرسال الرمز");
    }
  }, 1000);
}
// setLoading() now provided by utils.js
