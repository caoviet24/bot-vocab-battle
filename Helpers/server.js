const express = require("express");
const fs = require("fs");
const path = require("path");
const { handleProtectSimulation } = require("./encrypt.cjs");

const app = express();

app.use(express.json());

const PORT = 8081;

const DATA_FILE = path.join(__dirname, "data.json");
const DONE_FILE = path.join(__dirname, "done.json");

// Giới hạn số lần submit mỗi request để tránh gọi quá nhiều một lần
const MAX_AMOUNT_PER_REQUEST = 100;

let isSubmitting = false;

function loadJsonFile(filePath, defaultValue) {
  try {
    if (!fs.existsSync(filePath)) {
      return defaultValue;
    }

    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error(`Cannot read JSON file: ${filePath}`, err.message);
    return defaultValue;
  }
}

function saveJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function loadData() {
  return loadJsonFile(DATA_FILE, []);
}

function loadDoneData() {
  return loadJsonFile(DONE_FILE, []);
}

function saveDoneData(doneData) {
  saveJsonFile(DONE_FILE, doneData);
}

function isDone(doneData, payloadId, sentenceId) {
  const payload = doneData.find((x) => x.id === payloadId);

  if (!payload) {
    return false;
  }

  return payload.done.some((x) => x.sentence_id === sentenceId);
}

function markDone(doneData, payloadId, sentenceId) {
  let payload = doneData.find((x) => x.id === payloadId);

  if (!payload) {
    payload = {
      id: payloadId,
      done: [],
    };

    doneData.push(payload);
  }

  const exists = payload.done.some((x) => x.sentence_id === sentenceId);

  if (!exists) {
    payload.done.push({
      sentence_id: sentenceId,
    });
  }
}

function getAccessTokenFromHeader(req) {
  const authorization = req.headers.authorization;

  if (!authorization) {
    return null;
  }

  if (authorization.startsWith("Bearer ")) {
    return authorization.replace("Bearer ", "").trim();
  }

  return authorization.trim();
}

function getPendingSentences(data, doneData) {
  const pending = [];

  for (const item of data) {
    const payloadId = item.id;
    const sentenceIds = item?.data?.sentence_ids || [];

    for (const sentence of sentenceIds) {
      const sentenceId = sentence._id;

      if (!isDone(doneData, payloadId, sentenceId)) {
        pending.push({
          payloadId,
          sentenceId,
        });
      }
    }
  }

  return pending;
}

function getTotalSentences(data) {
  return data.reduce((sum, item) => {
    return sum + (item?.data?.sentence_ids?.length || 0);
  }, 0);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function submitSentence(sentenceId, accessToken) {
  const payload = {
    mistakes: 0,
    replay_count: 0,
    sentence_id: sentenceId,
  };

  const protectedData = await handleProtectSimulation(payload);

  while (true) {
    const response = await fetch(
      "https://api.parroto.app/api/sentences/submit",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          data: protectedData,
        }),
      },
    );

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after")) || 60;

      console.log(
        `Rate limit 429 - sentence ${sentenceId}. Retry after ${retryAfter}s`,
      );

      await sleep(retryAfter * 1000);
      continue;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");

      const error = new Error(`Submit failed: ${response.status} ${text}`);
      error.status = response.status;

      throw error;
    }

    return response.json();
  }
}

app.get("/status", (req, res) => {
  const data = loadData();
  const doneData = loadDoneData();

  const totalSentences = getTotalSentences(data);
  const pendingSentences = getPendingSentences(data, doneData);

  res.json({
    total: totalSentences,
    done: totalSentences - pendingSentences.length,
    remaining: pendingSentences.length,
  });
});

app.post("/submit", async (req, res) => {
  if (isSubmitting) {
    return res.status(409).json({
      message: "Server đang submit. Vui lòng gọi lại sau.",
    });
  }

  const accessToken = getAccessTokenFromHeader(req);

  if (!accessToken) {
    return res.status(401).json({
      message: "Thiếu token trong header Authorization.",
      example: "Authorization: Bearer <access_token>",
    });
  }

  const amount = Number(req.body.amount);

  if (!Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({
      message: "Payload không hợp lệ. amount phải là số nguyên lớn hơn 0.",
      example: {
        amount: 10,
      },
    });
  }

  if (amount > MAX_AMOUNT_PER_REQUEST) {
    return res.status(400).json({
      message: `amount tối đa mỗi request là ${MAX_AMOUNT_PER_REQUEST}.`,
    });
  }

  isSubmitting = true;

  try {
    const data = loadData();
    const doneData = loadDoneData();

    const totalSentences = getTotalSentences(data);
    const pendingSentences = getPendingSentences(data, doneData);

    const sentencesToSubmit = pendingSentences.slice(0, amount);

    const results = [];

    for (let i = 0; i < sentencesToSubmit.length; i++) {
      const item = sentencesToSubmit[i];

      try {
        await submitSentence(item.sentenceId, accessToken);

        markDone(doneData, item.payloadId, item.sentenceId);
        saveDoneData(doneData);

        console.log(
          `Success ${i + 1}/${sentencesToSubmit.length} | Payload ${item.payloadId} | ${item.sentenceId}`,
        );

        results.push({
          payloadId: item.payloadId,
          sentenceId: item.sentenceId,
          status: "success",
        });
      } catch (err) {
        console.error(
          `Failed ${i + 1}/${sentencesToSubmit.length} | Payload ${item.payloadId} | ${item.sentenceId}`,
          err.message,
        );

        results.push({
          payloadId: item.payloadId,
          sentenceId: item.sentenceId,
          status: "failed",
          error: err.message,
        });

        // Nếu token sai hoặc hết hạn thì dừng luôn, tránh gọi tiếp vô ích
        if (err.status === 401 || err.status === 403) {
          break;
        }
      }
    }

    const pendingAfter = getPendingSentences(data, doneData);

    const success = results.filter((x) => x.status === "success").length;
    const failed = results.filter((x) => x.status === "failed").length;

    return res.json({
      message: "Submit completed",
      requestedAmount: amount,
      actualSubmitCount: sentencesToSubmit.length,
      success,
      failed,
      total: totalSentences,
      remainingBefore: pendingSentences.length,
      remainingAfter: pendingAfter.length,
      results,
    });
  } catch (err) {
    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  } finally {
    isSubmitting = false;
  }
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
