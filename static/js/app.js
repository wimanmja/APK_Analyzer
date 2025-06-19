/**
 * APK Analyzer Application - Complete fix with obfuscation details preserved
 */

class APKAnalyzer {
  constructor(io) {
    this.analysisData = null
    this.io = io
    this.initElements()
    this.initComponents()
    this.initEventListeners()
    window.apkAnalyzer = this
  }

  initElements() {
    this.elements = {
      // Main pages
      uploadPage: document.getElementById("uploadPage"),
      summaryPage: document.getElementById("summaryPage"),
      detailPage: document.getElementById("detailPage"),

      // Upload-related elements
      uploadForm: document.getElementById("uploadForm"),
      fileInput: document.getElementById("fileInput"),
      uploadArea: document.getElementById("uploadArea"),
      fileName: document.getElementById("fileName"),
      submitButton: document.getElementById("submitButton"),
      loadingContainer: document.getElementById("loadingContainer"),
      progressFill: document.getElementById("progressFill"),

      // Summary page elements
      apkName: document.getElementById("apkName"),
      securityScore: document.getElementById("securityScore"),
      apkInfo: document.getElementById("apkInfo"),
      permissionsSummary: document.getElementById("permissionsSummary"),
      obfuscationStatus: document.getElementById("obfuscationStatus"),
      keyFindings: document.getElementById("keyFindings"),

      // Detail page elements
      detailApkName: document.getElementById("detailApkName"),
      permissionsList: document.getElementById("permissionsList"),
      obfuscationDetails: document.getElementById("obfuscationDetails"),
      manifestContent: document.getElementById("manifestContent"),
      fileStructure: document.getElementById("fileStructure"),

      // Common elements
      messageContainer: document.getElementById("messageContainer"),
      messageIcon: document.getElementById("messageIcon"),
      messageText: document.getElementById("messageText"),
    }
  }

  initComponents() {
    this.socketManager = new SocketManager(this.io)
    this.uiManager = new UIManager(this.elements)
    this.fileUploader = new FileUploader(this.elements, this.uiManager)
  }

  initEventListeners() {
    this.elements.uploadForm.addEventListener("submit", this.handleFormSubmit.bind(this))

    // Socket.IO event listeners
    this.socketManager.on("status", this.handleStatusUpdate.bind(this))
    this.socketManager.on("permissions", this.handlePermissionsReceived.bind(this))
    this.socketManager.on("obfuscation", this.handleObfuscationResults.bind(this))
    this.socketManager.on("analysis_complete", this.handleAnalysisComplete.bind(this))
    this.socketManager.on("analysis_status", this.handleAnalysisStatus.bind(this))
    this.socketManager.on("analysis_progress", this.handleAnalysisProgress.bind(this))
  }

  handleStatusUpdate(data) {
    console.log("Status update:", data)
  }

  handleAnalysisStatus(data) {
    console.log("Analysis status:", data)
    if (data.message) {
      this.uiManager.showMessage(data.message, "info")
    }
  }

  handleAnalysisProgress(data) {
    console.log("Analysis progress:", data)
    if (data.progress !== undefined) {
      this.elements.progressFill.style.width = `${data.progress}%`
    }
    if (data.message) {
      const loadingText = document.querySelector(".loading-text")
      if (loadingText) {
        loadingText.textContent = data.message
      }
    }
  }

  handleFormSubmit(e) {
    e.preventDefault()

    if (!this.fileUploader.validateFile()) {
      return
    }

    this.uiManager.setLoading(true)
    this.uiManager.showMessage("Processing your APK file...", "info")
    this.uploadFile()
  }

  async uploadFile() {
    try {
      const formData = new FormData(this.elements.uploadForm)

      const response = await fetch("/upload", {
        method: "POST",
        body: formData,
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "An error occurred during upload")
      }

      this.currentFileName = this.elements.fileInput.files[0].name

      if (result.complete_data) {
        this.analysisData = result.complete_data

        if (this.analysisData.obfuscation && this.analysisData.obfuscation.code_snippets) {
          window.currentObfuscationSnippets = this.analysisData.obfuscation.code_snippets
          console.log(`Stored ${this.analysisData.obfuscation.code_snippets.length} code snippets for pagination`)
        }

        this.showSummaryPage()
        return
      }

      this.analysisData = {
        fileName: this.currentFileName,
        permissions: [],
        obfuscation: { is_obfuscated: false, confidence: 0, code_snippets: [] },
        apkInfo: { name: this.currentFileName },
        apk_size_mb: null,
        runtime_seconds: null,
        runtime_display: null,
      }

      this.uiManager.showMessage("Analysis started. Please wait...", "info")

      this.analysisTimeout = setTimeout(() => {
        this.uiManager.showMessage("Analysis is taking longer than expected. Checking results...", "warning")
        this.checkAnalysisStatus()
      }, 30000)
    } catch (error) {
      this.uiManager.showMessage(`Error: ${error.message}`, "error")
      this.uiManager.setLoading(false)
    }
  }

  checkAnalysisStatus() {
    if (
      this.analysisData &&
      (this.analysisData.permissions.length > 0 || this.analysisData.obfuscation.is_obfuscated !== undefined)
    ) {
      this.showSummaryPage()
    } else {
      this.uiManager.showMessage("Analysis completed. Displaying available results...", "info")
      this.showSummaryPage()
    }
  }

  handleAnalysisComplete(data) {
    console.log("Analysis complete:", data)

    if (this.analysisTimeout) {
      clearTimeout(this.analysisTimeout)
    }

    if (this.analysisData) {
      this.analysisData = { ...this.analysisData, ...(data.results || data) }
    } else {
      this.analysisData = data.results || data
    }

    if (this.analysisData.obfuscation && this.analysisData.obfuscation.code_snippets) {
      window.currentObfuscationSnippets = this.analysisData.obfuscation.code_snippets
      console.log(`Stored ${this.analysisData.obfuscation.code_snippets.length} code snippets for pagination`)
    }

    this.showSummaryPage()
  }

  handlePermissionsReceived(data) {
    console.log("Permissions received:", data)
    if (this.analysisData) {
      this.analysisData.permissions = data.permissions || []

      if (this.analysisData.permissions.length > 0 && this.analysisData.obfuscation) {
        setTimeout(() => {
          if (this.elements.uploadPage.classList.contains("active")) {
            this.showSummaryPage()
          }
        }, 2000)
      }
    }
  }

  handleObfuscationResults(data) {
    console.log("Obfuscation results received:", data)
    if (this.analysisData) {
      this.analysisData.obfuscation = data

      if (data.code_snippets) {
        window.currentObfuscationSnippets = data.code_snippets
        console.log(`Stored ${data.code_snippets.length} real obfuscation code snippets for pagination`)
      }

      if (this.analysisData.permissions.length > 0 && this.analysisData.obfuscation) {
        setTimeout(() => {
          if (this.elements.uploadPage.classList.contains("active")) {
            this.showSummaryPage()
          }
        }, 2000)
      }
    }
  }

  showSummaryPage() {
    this.uiManager.setLoading(false)
    this.uiManager.hideMessage()
    this.uiManager.showPage("summary")
    this.populateSummaryPage()
  }

  showDetailPage() {
    console.log("APKAnalyzer.showDetailPage called")

    if (!this.analysisData) {
      this.uiManager.showMessage("No analysis data available. Please run an analysis first.", "warning")
      return
    }

    this.uiManager.showPage("detail")
    this.populateDetailPage()
  }

  resetUploadForm() {
    console.log("Resetting upload form...")

    this.elements.fileInput.value = ""
    this.uiManager.hideFileName()
    this.elements.uploadForm.reset()
    this.uiManager.hideMessage()
    this.uiManager.setLoading(false)
    this.analysisData = null
    window.currentObfuscationSnippets = null

    console.log("Upload form reset complete")
  }

  populateSummaryPage() {
    if (!this.analysisData) {
      this.showPlaceholderSummary()
      return
    }

    const data = this.analysisData

    this.elements.apkName.textContent = data.fileName || data.apkInfo?.name || "Unknown APK"

    const securityScore = this.calculateSecurityScore(data)
    this.uiManager.updateSecurityScore(securityScore)

    this.uiManager.updateApkInfo(data.apkInfo || { name: data.fileName }, data)

    const permissionsSummary = this.calculatePermissionsSummary(data.permissions || [])
    this.uiManager.updatePermissionsSummary(permissionsSummary)

    this.uiManager.updateObfuscationStatus(data.obfuscation || { is_obfuscated: false, confidence: 0 })

    const keyFindings = this.generateKeyFindings(data)
    this.uiManager.updateKeyFindings(keyFindings)
  }

  populateDetailPage() {
    if (!this.analysisData) {
      this.showPlaceholderDetail()
      return
    }

    const data = this.analysisData

    this.elements.detailApkName.textContent = data.fileName || data.apkInfo?.name || "Unknown APK"

    this.uiManager.updatePermissionsList(data.permissions || [])
    this.uiManager.updateObfuscationDetails(data.obfuscation || { is_obfuscated: false, code_snippets: [] })
    this.uiManager.updateManifestContent({ content: data.manifest || "Manifest data not available" })
    this.uiManager.updateFileStructure(data.fileStructure || ["File structure not available"])
  }

  calculateSecurityScore(data) {
    let score = 100
    const permissions = data.permissions || []

    const dangerousCount = permissions.filter(
      (p) =>
        p.protection_level === "dangerous" ||
        p.name?.includes("CAMERA") ||
        p.name?.includes("LOCATION") ||
        p.name?.includes("CONTACTS"),
    ).length

    score -= dangerousCount * 5

    if (data.obfuscation?.is_obfuscated) {
      score -= 20
    }

    score = Math.max(0, Math.min(100, score))

    let level = "Low"
    if (score >= 80) level = "High"
    else if (score >= 60) level = "Medium"

    return { score, level }
  }

  calculatePermissionsSummary(permissions) {
    const summary = {
      total: permissions.length,
      dangerous: 0,
      normal: 0,
      signature: 0,
      unknown: 0,
    }

    permissions.forEach((permission) => {
      const level = permission.protection_level || "unknown"
      if (summary.hasOwnProperty(level)) {
        summary[level]++
      } else {
        summary.unknown++
      }
    })

    return summary
  }

  generateKeyFindings(data) {
    const findings = []
    const permissions = data.permissions || []

    const dangerousCount = permissions.filter(
      (p) => p.protection_level === "dangerous" || p.name?.includes("CAMERA") || p.name?.includes("LOCATION"),
    ).length

    if (dangerousCount > 5) {
      findings.push({
        type: "warning",
        message: `High number of dangerous permissions (${dangerousCount})`,
      })
    }

    if (data.obfuscation?.is_obfuscated) {
      const confidence = data.obfuscation.confidence || 0
      const snippetsCount = data.obfuscation.code_snippets?.length || 0
      findings.push({
        type: "info",
        message: `Code obfuscation detected (${confidence}% confidence, ${snippetsCount} code snippets found)`,
      })
    }

    if (permissions.length > 20) {
      findings.push({
        type: "warning",
        message: `Large number of permissions requested (${permissions.length})`,
      })
    }

    if (findings.length === 0) {
      findings.push({
        type: "success",
        message: "No significant security concerns detected",
      })
    }

    return findings
  }

  showPlaceholderSummary() {
    this.elements.apkName.textContent = "Analysis in progress..."
    this.uiManager.updateSecurityScore({ score: 0, level: "Analyzing" })
    this.uiManager.showMessage("Waiting for analysis results...", "info")
  }

  showPlaceholderDetail() {
    this.elements.detailApkName.textContent = "Analysis in progress..."
    this.uiManager.showMessage("Waiting for detailed analysis results...", "info")
  }
}

/**
 * Socket Manager class
 */
class SocketManager {
  constructor(io) {
    if (typeof io !== "undefined") {
      this.socket = io()
      this.setupSocketEvents()
    } else {
      console.error("Socket.IO is not loaded")
    }
  }

  setupSocketEvents() {
    if (!this.socket) return

    this.socket.on("connect", () => {
      console.log("Connected to server")
    })

    this.socket.on("disconnect", () => {
      console.log("Disconnected from server")
    })

    this.socket.on("connect_error", (error) => {
      console.error("Connection error:", error)
    })
  }

  on(event, callback) {
    if (this.socket) {
      this.socket.on(event, callback)
    }
  }

  emit(event, data) {
    if (this.socket) {
      this.socket.emit(event, data)
    }
  }
}

/**
 * UI Manager class - RESTORED complete obfuscation details functionality
 */
class UIManager {
  constructor(elements) {
    this.elements = elements
  }

  showPage(pageName) {
    console.log("UIManager.showPage called with:", pageName)

    document.querySelectorAll(".page").forEach((page) => {
      page.classList.remove("active")
    })

    const targetPage = document.getElementById(`${pageName}Page`)
    if (targetPage) {
      targetPage.classList.add("active")
      console.log(`Successfully showed ${pageName} page`)
    } else {
      console.error(`Page ${pageName}Page not found`)
    }
  }

  setLoading(isLoading) {
    this.elements.loadingContainer.style.display = isLoading ? "block" : "none"
    this.elements.submitButton.disabled = isLoading

    if (isLoading) {
      this.elements.submitButton.innerHTML = '<div class="spinner"></div>Analyzing...'
      this.elements.progressFill.style.width = "0%"
    } else {
      const uploadIcon =
        '<svg class="icon" style="width: 1rem; height: 1rem;" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>'
      this.elements.submitButton.innerHTML = uploadIcon + "Analyze APK"
    }
  }

  showMessage(message, type = "info") {
    this.elements.messageText.textContent = message
    this.elements.messageContainer.style.display = "flex"

    this.elements.messageContainer.classList.remove("error", "success", "info", "warning")
    this.elements.messageContainer.classList.add(type)

    let iconSvg = ""
    switch (type.toUpperCase()) {
      case "ERROR":
        iconSvg =
          '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>'
        break
      case "SUCCESS":
        iconSvg =
          '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>'
        break
      case "WARNING":
        iconSvg =
          '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>'
        break
      default:
        iconSvg =
          '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>'
    }

    this.elements.messageIcon.innerHTML = iconSvg
  }

  hideMessage() {
    this.elements.messageContainer.style.display = "none"
  }

  updateSecurityScore(scoreData) {
    const scoreElement = this.elements.securityScore
    let scoreClass = "medium"

    if (scoreData.level === "High") scoreClass = "high"
    else if (scoreData.level === "Low") scoreClass = "low"

    scoreElement.innerHTML = `
      <div class="score-number">${scoreData.score}</div>
      <div class="score-level">${scoreData.level} Security</div>
    `

    scoreElement.className = `score-display ${scoreClass}`
  }

  updateApkInfo(apkInfo, analysisData) {
    const nameDisplay = analysisData?.apk_name || apkInfo.name || "Unknown"
    const packageDisplay = analysisData?.apkInfo?.package_name || apkInfo.package_name || "Unknown"
    const versionDisplay = analysisData?.apkInfo?.version_name || apkInfo.version_name || "Unknown"
    const sizeDisplay = analysisData?.apk_size_mb ? `${analysisData.apk_size_mb} MB` : apkInfo.size || "Unknown"
    const runtimeDisplay = analysisData?.runtime_display || "N/A"

    this.elements.apkInfo.innerHTML = `
      <div class="info-item">
        <span class="info-label">Name:</span>
        <span class="info-value">${nameDisplay}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Package:</span>
        <span class="info-value">${packageDisplay}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Version:</span>
        <span class="info-value">${versionDisplay}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Size:</span>
        <span class="info-value">${sizeDisplay}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Analysis Time:</span>
        <span class="info-value">${runtimeDisplay}</span>
      </div>
    `
  }

  updatePermissionsSummary(permissionsSummary) {
    this.elements.permissionsSummary.innerHTML = `
      <div class="permission-type">
        <div class="permission-type-info">
          <div class="permission-dot dangerous"></div>
          <span>Dangerous</span>
        </div>
        <span class="permission-count">${permissionsSummary.dangerous}</span>
      </div>
      <div class="permission-type">
        <div class="permission-type-info">
          <div class="permission-dot normal"></div>
          <span>Normal</span>
        </div>
        <span class="permission-count">${permissionsSummary.normal}</span>
      </div>
      <div class="permission-type">
        <div class="permission-type-info">
          <div class="permission-dot signature"></div>
          <span>Signature</span>
        </div>
        <span class="permission-count">${permissionsSummary.signature}</span>
      </div>
      <div class="permission-type">
        <div class="permission-type-info">
          <div class="permission-dot unknown"></div>
          <span>Unknown</span>
        </div>
        <span class="permission-count">${permissionsSummary.unknown}</span>
      </div>
    `
  }

  updateObfuscationStatus(obfuscation) {
    const isObfuscated = obfuscation.is_obfuscated
    const confidence = obfuscation.confidence || 0

    this.elements.obfuscationStatus.innerHTML = `
      <div class="obfuscation-icon ${isObfuscated ? "detected" : "not-detected"}">
        <svg class="icon" style="width: 3rem; height: 3rem;" viewBox="0 0 24 24">
          ${
            isObfuscated
              ? '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M12 8v4M12 16h.01"/>'
              : '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'
          }
        </svg>
      </div>
      <div class="obfuscation-text">${isObfuscated ? "Obfuscated" : "Not Obfuscated"}</div>
      <div class="obfuscation-confidence">Confidence: ${confidence}%</div>
    `
  }

  updateKeyFindings(findings) {
    this.elements.keyFindings.innerHTML = findings
      .map(
        (finding) => `
          <div class="finding-item ${finding.type}">
            <svg class="icon" viewBox="0 0 24 24">
              ${this.getFindingIcon(finding.type)}
            </svg>
            <span>${finding.message}</span>
          </div>
        `,
      )
      .join("")
  }

  updatePermissionsList(permissions) {
    if (!permissions || permissions.length === 0) {
      this.elements.permissionsList.innerHTML = "<p>No permissions data available.</p>"
      return
    }

    this.elements.permissionsList.innerHTML = permissions
      .map(
        (permission) => `
          <div class="permission-item">
            <div class="permission-header">
              <span class="permission-name">${permission.name}</span>
              <span class="permission-level ${permission.protection_level || "unknown"}">${permission.protection_level || "unknown"}</span>
            </div>
            <div class="permission-description">${permission.description || "No description available"}</div>
          </div>
        `,
      )
      .join("")
  }

  // RESTORED: Complete obfuscation details with code snippets
  updateObfuscationDetails(obfuscation) {
    const isObfuscated = obfuscation.is_obfuscated
    const confidence = obfuscation.confidence || 0
    const codeSnippets = obfuscation.code_snippets || []

    let html = `
  <div class="obfuscation-summary ${isObfuscated ? "detected" : "not-detected"}">
    <div class="obfuscation-header">
      <div class="obfuscation-status">
        <svg class="icon obfuscation-icon" viewBox="0 0 24 24">
          ${
            isObfuscated
              ? '<path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/><path d="M12 7v4m0 4h.01"/>'
              : '<path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/><path d="M9 12l2 2 4-4"/>'
          }
        </svg>
        <div>
          <h4>${isObfuscated ? "🔒 Obfuscation Detected" : "✅ No Significant Obfuscation"}</h4>
          <p class="confidence-text">Confidence Level: <strong>${confidence}%</strong></p>
          ${codeSnippets.length > 0 ? `<p class="snippets-count">Found <strong>${codeSnippets.length}</strong> obfuscated code snippets</p>` : ""}
        </div>
      </div>
      <div class="risk-level ${this.getObfuscationRiskLevel(confidence)}">
        ${this.getObfuscationRiskText(confidence)}
      </div>
    </div>
  </div>
`

    if (isObfuscated) {
      html += `
    <div class="obfuscation-explanation">
      <h4>🔍 What is Code Obfuscation?</h4>
      <p>Code obfuscation is a technique used to make source code difficult to understand while preserving its functionality. While sometimes used for legitimate intellectual property protection, it can also hide malicious behavior.</p>
      
      <div class="obfuscation-details">
        <h5>Common Obfuscation Techniques:</h5>
        <ul>
          <li><strong>Name Mangling:</strong> Replacing meaningful class, method, and variable names with short, meaningless identifiers</li>
          <li><strong>Control Flow Obfuscation:</strong> Adding unnecessary jumps, loops, and conditional statements to confuse analysis</li>
          <li><strong>String Encryption:</strong> Encrypting string literals and decrypting them at runtime</li>
          <li><strong>Dead Code Insertion:</strong> Adding code that never executes but complicates analysis</li>
          <li><strong>Reflection Usage:</strong> Using Java reflection to hide method calls and class instantiations</li>
        </ul>
      </div>

      <div class="legitimate-vs-malicious">
        <h5>Legitimate vs Malicious Use:</h5>
        <div class="comparison-grid">
          <div class="legitimate-use">
            <h6>✅ Legitimate Reasons:</h6>
            <ul>
              <li>Intellectual property protection</li>
              <li>Preventing reverse engineering of proprietary algorithms</li>
              <li>Commercial software protection</li>
              <li>Anti-piracy measures</li>
            </ul>
          </div>
          <div class="malicious-use">
            <h6>⚠️ Potential Red Flags:</h6>
            <ul>
              <li>Hiding malicious functionality</li>
              <li>Evading security scanners</li>
              <li>Concealing data theft operations</li>
              <li>Masking unauthorized network communications</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  `
    }

    // Enhanced indicators section with detailed explanations
    if (obfuscation.indicators && obfuscation.indicators.length > 0) {
      html += `
    <div class="indicators-section">
      <h4>🚨 Obfuscation Indicators Found</h4>
      <p class="indicators-intro">The following patterns were detected in the analyzed code that suggest the use of obfuscation techniques:</p>
      <div class="indicators-grid">
  `

      obfuscation.indicators.forEach((indicator, index) => {
        const indicatorDetails = this.getIndicatorDetails(indicator.type)
        html += `
      <div class="indicator-card">
        <div class="indicator-header">
          <div class="indicator-title">
            <span class="indicator-icon">${indicatorDetails.icon}</span>
            <span class="indicator-name">${indicator.description || indicatorDetails.name}</span>
          </div>
          <div class="indicator-severity ${indicator.severity}">
            ${indicator.severity.toUpperCase()}
          </div>
        </div>
        
        <div class="indicator-stats">
          <div class="stat-item">
            <span class="stat-label">Occurrences:</span>
            <span class="stat-value">${indicator.count.toLocaleString()}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Impact:</span>
            <span class="stat-value">${indicatorDetails.impact}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Severity:</span>
            <span class="stat-value">${indicator.severity}</span>
          </div>
        </div>

        <div class="indicator-description">
          <h5>Why this indicates obfuscation:</h5>
          <p>${indicatorDetails.explanation}</p>
        </div>

        <div class="technical-details">
          <h5>Technical Analysis:</h5>
          <p>${indicatorDetails.technicalDetails || "This pattern is commonly used in obfuscated code to make analysis more difficult."}</p>
        </div>

        <div class="security-implications">
          <h5>Security Implications:</h5>
          <ul>
            ${indicatorDetails.securityRisks.map((risk) => `<li>${risk}</li>`).join("")}
          </ul>
        </div>

        <div class="detection-confidence">
          <h5>Detection Confidence:</h5>
          <div class="confidence-bar">
            <div class="confidence-fill ${indicator.severity}" style="width: ${this.getConfidencePercentage(indicator.severity)}%"></div>
          </div>
          <span class="confidence-text">${this.getConfidenceText(indicator.severity)}</span>
        </div>
      </div>
    `
      })

      html += `
      </div>
      
      <div class="indicators-summary">
        <h5>📊 Analysis Summary:</h5>
        <p>Found <strong>${obfuscation.indicators.length}</strong> different types of obfuscation indicators with a total of <strong>${obfuscation.indicators.reduce((sum, ind) => sum + ind.count, 0).toLocaleString()}</strong> occurrences across the analyzed code.</p>
        
        <div class="severity-breakdown">
          <h6>Severity Breakdown:</h6>
          <div class="severity-stats">
            <span class="severity-stat high">High: ${obfuscation.indicators.filter((i) => i.severity === "high").length}</span>
            <span class="severity-stat medium">Medium: ${obfuscation.indicators.filter((i) => i.severity === "medium").length}</span>
            <span class="severity-stat low">Low: ${obfuscation.indicators.filter((i) => i.severity === "low").length}</span>
          </div>
        </div>
      </div>
    </div>
  `
    }

    // Add real obfuscated code snippets section with pagination
    if (codeSnippets.length > 0) {
      html += this.generateRealObfuscatedCodeSection(codeSnippets)
    }

    // Add comprehensive recommendations section
    if (isObfuscated) {
      html += `
    <div class="recommendations-section">
      <h4>🛡️ Security Recommendations</h4>
      <p class="recommendations-intro">Based on the obfuscation analysis, here are our security recommendations organized by priority:</p>
      
      <div class="recommendations-grid">
        <div class="recommendation-card high-priority">
          <h5>🔴 High Priority Actions</h5>
          <div class="recommendation-content">
            <h6>Immediate Actions Required:</h6>
            <ul>
              <li><strong>Verify App Source:</strong> Confirm the app comes from a trusted developer and official app store</li>
              <li><strong>Check Digital Signatures:</strong> Ensure the app is properly signed by the claimed developer</li>
              <li><strong>Review Permissions Carefully:</strong> Examine all requested permissions and question any that seem excessive</li>
              <li><strong>Monitor Installation:</strong> Watch for unusual behavior during and after installation</li>
              <li><strong>Sandbox Testing:</strong> If possible, test the app in an isolated environment first</li>
            </ul>
            
            <h6>Red Flags to Watch For:</h6>
            <ul>
              <li>Requests for admin privileges without clear justification</li>
              <li>Unusual network activity or data transmission</li>
              <li>Attempts to access sensitive device features</li>
              <li>Persistence mechanisms or auto-start behavior</li>
            </ul>
          </div>
        </div>
        
        <div class="recommendation-card medium-priority">
          <h5>🟡 Medium Priority Actions</h5>
          <div class="recommendation-content">
            <h6>Additional Security Measures:</h6>
            <ul>
              <li><strong>Use Multiple Scanners:</strong> Run the APK through additional security scanning tools</li>
              <li><strong>Check App Reputation:</strong> Research the app and developer online for reviews and security reports</li>
              <li><strong>Review Similar Apps:</strong> Look for alternative apps with better transparency and security practices</li>
              <li><strong>Enable Security Features:</strong> Ensure device security features like app verification are enabled</li>
              <li><strong>Regular Updates:</strong> Keep your device OS and security software up to date</li>
              <li><strong>Backup Important Data:</strong> Ensure you have recent backups before installing suspicious apps</li>
            </ul>
            
            <h6>Monitoring Recommendations:</h6>
            <ul>
              <li>Monitor network traffic for unusual patterns</li>
              <li>Check battery usage for unexpected drain</li>
              <li>Review app permissions periodically</li>
              <li>Watch for new files or changes to system settings</li>
            </ul>
          </div>
        </div>
        
        <div class="recommendation-card low-priority">
          <h5>🟢 General Security Best Practices</h5>
          <div class="recommendation-content">
            <h6>Long-term Security Practices:</h6>
            <ul>
              <li><strong>App Sandboxing:</strong> Use app isolation features when available</li>
              <li><strong>Regular Security Audits:</strong> Periodically review all installed apps</li>
              <li><strong>Security Education:</strong> Stay informed about mobile security threats</li>
              <li><strong>Principle of Least Privilege:</strong> Only grant necessary permissions to apps</li>
              <li><strong>Incident Response Plan:</strong> Know how to respond if malicious behavior is detected</li>
            </ul>
            
            <h6>Preventive Measures:</h6>
            <ul>
              <li>Use reputable app stores and avoid sideloading when possible</li>
              <li>Enable automatic security updates</li>
              <li>Consider using mobile device management (MDM) solutions</li>
              <li>Implement network-level security monitoring</li>
            </ul>
          </div>
        </div>
      </div>
      
      <div class="risk-assessment">
        <h5>🎯 Risk Assessment Based on Analysis:</h5>
        <div class="risk-factors">
          <div class="risk-factor">
            <span class="risk-label">Obfuscation Confidence:</span>
            <span class="risk-value ${this.getObfuscationRiskLevel(confidence)}">${confidence}% (${this.getObfuscationRiskText(confidence)})</span>
          </div>
          <div class="risk-factor">
            <span class="risk-label">Code Snippets Found:</span>
            <span class="risk-value">${codeSnippets.length.toLocaleString()} obfuscated patterns</span>
          </div>
          <div class="risk-factor">
            <span class="risk-label">Indicator Types:</span>
            <span class="risk-value">${obfuscation.indicators?.length || 0} different obfuscation techniques</span>
          </div>
        </div>
        
        <div class="overall-recommendation">
          <h6>Overall Recommendation:</h6>
          <p class="recommendation-text ${this.getObfuscationRiskLevel(confidence)}">
            ${this.getOverallRecommendation(confidence, codeSnippets.length)}
          </p>
        </div>
      </div>
    </div>
  `
    }

    this.elements.obfuscationDetails.innerHTML = html

    // Initialize pagination if code snippets exist
    if (codeSnippets.length > 0) {
      // Ensure global snippets are available
      if (!window.currentObfuscationSnippets) {
        window.currentObfuscationSnippets = codeSnippets
      }
      this.initializeObfuscationPagination()
    }
  }

  generateRealObfuscatedCodeSection(codeSnippets) {
    const totalSnippets = codeSnippets.length
    const snippetsPerPage = 10
    const totalPages = Math.ceil(totalSnippets / snippetsPerPage)

    const html = `
    <div class="obfuscated-code-section">
      <div class="section-header">
        <h4>🔍 Real Obfuscated Code Snippets Found</h4>
        <div class="snippets-summary">
          <span class="total-snippets">Total: ${totalSnippets.toLocaleString()} snippets</span>
          <span class="pages-info">Pages: ${totalPages}</span>
          <span class="analysis-note">Showing actual obfuscated code patterns detected in the APK</span>
        </div>
      </div>
      
      <div class="code-analysis-info">
        <h5>📋 Code Analysis Information:</h5>
        <p>The following code snippets represent actual obfuscated patterns found during static analysis of the APK. Each snippet shows the context where obfuscation techniques were detected, including the specific patterns that triggered the detection.</p>
        
        <div class="snippet-legend">
          <h6>Snippet Information Legend:</h6>
          <div class="legend-items">
            <div class="legend-item">
              <span class="legend-color high"></span>
              <span class="legend-text">High Severity - Strong indicators of obfuscation</span>
            </div>
            <div class="legend-item">
              <span class="legend-color medium"></span>
              <span class="legend-text">Medium Severity - Moderate obfuscation indicators</span>
            </div>
            <div class="legend-item">
              <span class="legend-color low"></span>
              <span class="legend-text">Low Severity - Weak or ambiguous indicators</span>
            </div>
          </div>
        </div>
      </div>
      
      <div class="pagination-controls top-pagination">
        <button class="pagination-btn" id="prevBtn" onclick="changeObfuscationPage(-1)" disabled>
          <svg class="icon" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>
          Previous
        </button>
        <div class="page-info">
          <span>Page <span id="currentPage">1</span> of <span id="totalPages">${totalPages}</span></span>
          <span class="page-details">(Showing snippets 1-${Math.min(snippetsPerPage, totalSnippets)} of ${totalSnippets})</span>
        </div>
        <button class="pagination-btn" id="nextBtn" onclick="changeObfuscationPage(1)" ${totalPages <= 1 ? "disabled" : ""}>
          Next
          <svg class="icon" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>

      <div id="codeSnippetsContainer" class="code-snippets-container">
        <!-- Code snippets will be populated here -->
      </div>

      <div class="pagination-controls bottom-pagination">
        <button class="pagination-btn" onclick="changeObfuscationPage(-1)" disabled>
          <svg class="icon" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>
          Previous
        </button>
        <div class="page-info">
          <span>Page <span class="current-page-bottom">1</span> of <span class="total-pages-bottom">${totalPages}</span></span>
        </div>
        <button class="pagination-btn" onclick="changeObfuscationPage(1)" ${totalPages <= 1 ? "disabled" : ""}>
          Next
          <svg class="icon" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>
      
      <div class="code-analysis-footer">
        <h5>🔬 Analysis Notes:</h5>
        <ul>
          <li><strong>Context Preservation:</strong> Each snippet includes surrounding code context for better understanding</li>
          <li><strong>Pattern Matching:</strong> Highlighted patterns show the specific obfuscation techniques detected</li>
          <li><strong>File Location:</strong> Full file paths help identify the scope of obfuscation across the application</li>
          <li><strong>Line Numbers:</strong> Precise locations enable manual verification and deeper analysis</li>
        </ul>
      </div>
    </div>
  `

    return html
  }

  initializeObfuscationPagination() {
    console.log("Initializing obfuscation pagination...")
    console.log("Available snippets:", window.currentObfuscationSnippets?.length || 0)

    // Store pagination data globally for access by pagination functions
    window.obfuscationPagination = {
      currentPage: 1,
      snippetsPerPage: 10,
      allSnippets: window.currentObfuscationSnippets || [],
    }

    console.log("Pagination initialized with", window.obfuscationPagination.allSnippets.length, "snippets")
    this.displayObfuscationPage(1)
  }

  displayObfuscationPage(pageNumber) {
    console.log(`Displaying obfuscation page ${pageNumber}`)

    const pagination = window.obfuscationPagination
    if (!pagination || !pagination.allSnippets || pagination.allSnippets.length === 0) {
      console.error("No pagination data or snippets available")
      return
    }

    const startIndex = (pageNumber - 1) * pagination.snippetsPerPage
    const endIndex = startIndex + pagination.snippetsPerPage
    const pageSnippets = pagination.allSnippets.slice(startIndex, endIndex)
    const totalPages = Math.ceil(pagination.allSnippets.length / pagination.snippetsPerPage)

    console.log(
      `Showing snippets ${startIndex + 1}-${Math.min(endIndex, pagination.allSnippets.length)} of ${pagination.allSnippets.length}`,
    )

    let html = ""
    pageSnippets.forEach((snippet, index) => {
      const globalIndex = startIndex + index + 1
      html += `
      <div class="code-snippet-card">
        <div class="snippet-header">
          <div class="snippet-info">
            <span class="snippet-number">#${globalIndex}</span>
            <span class="snippet-type">${snippet.type || "Code Pattern"}</span>
            <span class="snippet-severity ${snippet.severity || "medium"}">${(snippet.severity || "medium").toUpperCase()}</span>
          </div>
          <div class="snippet-location">
            <span class="file-path" title="${snippet.file || "Unknown file"}">${this.truncateFilePath(snippet.file || "Unknown file")}</span>
            <span class="line-number">Lines ${snippet.line_start || "?"}-${snippet.line_end || "?"}</span>
          </div>
        </div>
        
        <div class="snippet-metadata">
          <div class="metadata-item">
            <span class="metadata-label">Pattern Type:</span>
            <span class="metadata-value">${snippet.pattern_type || "Unknown"}</span>
          </div>
          <div class="metadata-item">
            <span class="metadata-label">Detection ID:</span>
            <span class="metadata-value">${snippet.id || "N/A"}</span>
          </div>
          <div class="metadata-item">
            <span class="metadata-label">Context Lines:</span>
            <span class="metadata-value">${snippet.context_start || "?"} - ${snippet.context_end || "?"}</span>
          </div>
        </div>
        
        <div class="real-code-snippet">
          <div class="code-block">
            <h6>🎯 Detected Pattern: <code>${snippet.matched_text ? this.escapeHtml(snippet.matched_text) : "Pattern match"}</code></h6>
            <div class="matched-line">
              <strong>Matched Line:</strong> <code>${this.escapeHtml(snippet.matched_line || "Line not available")}</code>
            </div>
            <h6>📄 Code Context:</h6>
            <pre><code>${this.escapeHtml(snippet.code_snippet || "Code not available")}</code></pre>
          </div>
          
          <div class="snippet-analysis">
            <h6>🔍 Analysis Details:</h6>
            <p>${this.getSnippetAnalysis(snippet)}</p>
          </div>
        </div>
      </div>
    `
    })

    const container = document.getElementById("codeSnippetsContainer")
    if (container) {
      container.innerHTML = html
      console.log("Code snippets container updated with", pageSnippets.length, "snippets")
    } else {
      console.error("Code snippets container not found")
    }

    // Update pagination controls
    this.updatePaginationControls(pageNumber, totalPages)
  }

  updatePaginationControls(currentPage, totalPages) {
    console.log(`Updating pagination controls: page ${currentPage} of ${totalPages}`)

    // Update page numbers
    const currentPageElements = document.querySelectorAll("#currentPage, .current-page-bottom")
    const totalPagesElements = document.querySelectorAll("#totalPages, .total-pages-bottom")

    currentPageElements.forEach((el) => {
      if (el) el.textContent = currentPage
    })
    totalPagesElements.forEach((el) => {
      if (el) el.textContent = totalPages
    })

    // Update page details
    const pagination = window.obfuscationPagination
    if (pagination) {
      const startIndex = (currentPage - 1) * pagination.snippetsPerPage + 1
      const endIndex = Math.min(currentPage * pagination.snippetsPerPage, pagination.allSnippets.length)

      const pageDetailsElements = document.querySelectorAll(".page-details")
      pageDetailsElements.forEach((el) => {
        if (el) el.textContent = `(Showing snippets ${startIndex}-${endIndex} of ${pagination.allSnippets.length})`
      })
    }

    // Update button states
    const prevButtons = document.querySelectorAll(".pagination-btn:first-child")
    const nextButtons = document.querySelectorAll(".pagination-btn:last-child")

    prevButtons.forEach((btn) => {
      btn.disabled = currentPage <= 1
    })

    nextButtons.forEach((btn) => {
      btn.disabled = currentPage >= totalPages
    })

    // Update global pagination state
    if (window.obfuscationPagination) {
      window.obfuscationPagination.currentPage = currentPage
    }

    console.log("Pagination controls updated")
  }

  getSnippetAnalysis(snippet) {
    const patternType = snippet.pattern_type || snippet.type || "unknown"
    const severity = snippet.severity || "medium"

    const analyses = {
      short_class_names:
        "This snippet shows a class with an extremely short name, which is a strong indicator of name obfuscation. Legitimate classes typically have descriptive names that reflect their purpose.",
      short_method_names:
        "This code contains methods with very short names (1-2 characters), suggesting systematic name obfuscation to hide the original method purposes.",
      short_field_names:
        "The field names in this code are unusually short, indicating field name obfuscation that makes it difficult to understand the data structure.",
      synthetic_methods:
        "This shows compiler-generated synthetic methods, which can indicate complex obfuscation or the use of inner classes to hide functionality.",
      access_methods:
        "These are synthetic access methods (access$XXX) generated to bypass Java access restrictions, often used in obfuscated code.",
      obfuscated_packages:
        "The package structure uses single-character names instead of meaningful hierarchical naming, indicating package name obfuscation.",
      string_encryption:
        "This code pattern suggests string encryption or encoding, which is used to hide sensitive strings from static analysis.",
      reflection:
        "This snippet shows the use of Java reflection, which can be used to dynamically access classes and methods, making static analysis more difficult.",
      base64_strings:
        "Base64 encoded strings detected, which may be used to hide configuration data, URLs, or other sensitive information.",
      hex_strings:
        "Hexadecimal encoded strings found, potentially hiding binary data, encryption keys, or other sensitive information.",
      dollar_classes:
        "Inner classes with obfuscated names detected, often used to hide complex class relationships and callback mechanisms.",
    }

    const defaultAnalysis = `This code pattern (${patternType}) with ${severity} severity suggests the use of obfuscation techniques that make the code harder to analyze and understand.`

    return analyses[patternType] || defaultAnalysis
  }

  truncateFilePath(filePath, maxLength = 50) {
    if (filePath.length <= maxLength) return filePath
    const parts = filePath.split("/")
    if (parts.length <= 2) return filePath

    return `.../${parts[parts.length - 2]}/${parts[parts.length - 1]}`
  }

  getConfidencePercentage(severity) {
    switch (severity) {
      case "high":
        return 85
      case "medium":
        return 65
      case "low":
        return 40
      default:
        return 50
    }
  }

  getConfidenceText(severity) {
    switch (severity) {
      case "high":
        return "High confidence - Strong obfuscation indicator"
      case "medium":
        return "Medium confidence - Moderate obfuscation indicator"
      case "low":
        return "Low confidence - Weak obfuscation indicator"
      default:
        return "Unknown confidence level"
    }
  }

  getOverallRecommendation(confidence, snippetsCount) {
    if (confidence >= 80) {
      return `🚨 HIGH RISK: Strong obfuscation detected with ${confidence}% confidence and ${snippetsCount} code patterns. Exercise extreme caution and consider avoiding this app unless from a highly trusted source.`
    } else if (confidence >= 60) {
      return `⚠️ MEDIUM RISK: Moderate obfuscation detected with ${confidence}% confidence and ${snippetsCount} code patterns. Proceed with caution and implement additional security measures.`
    } else if (confidence >= 40) {
      return `🟡 LOW RISK: Some obfuscation patterns detected with ${confidence}% confidence and ${snippetsCount} code patterns. Monitor the app behavior and verify the source.`
    } else {
      return `✅ MINIMAL RISK: Low confidence obfuscation detection (${confidence}%) with ${snippetsCount} patterns. May be legitimate protection or false positives.`
    }
  }

  getObfuscationRiskLevel(confidence) {
    if (confidence >= 80) return "high-risk"
    if (confidence >= 60) return "medium-risk"
    if (confidence >= 40) return "low-risk"
    return "minimal-risk"
  }

  getObfuscationRiskText(confidence) {
    if (confidence >= 80) return "HIGH RISK"
    if (confidence >= 60) return "MEDIUM RISK"
    if (confidence >= 40) return "LOW RISK"
    return "MINIMAL RISK"
  }

  getIndicatorDetails(type) {
    const indicators = {
      short_class_names: {
        name: "Short Class Names",
        icon: "🏷️",
        severity: "high",
        impact: "Code Readability",
        explanation:
          "Classes with extremely short names (1-2 characters) are a strong indicator of name obfuscation. Legitimate code typically uses descriptive class names that reflect their purpose.",
        technicalDetails:
          "Detected through pattern matching of class declarations with names shorter than 3 characters, excluding common abbreviations and standard library classes.",
        securityRisks: [
          "Makes reverse engineering analysis difficult",
          "Hides the actual purpose of classes",
          "Complicates security auditing processes",
          "May indicate attempt to hide malicious functionality",
          "Reduces code maintainability and transparency",
        ],
      },
      short_method_names: {
        name: "Short Method Names",
        icon: "🔤",
        severity: "high",
        impact: "Code Readability",
        explanation:
          "Methods with extremely short names (1-2 characters) are a strong indicator of name obfuscation. Legitimate code typically uses descriptive method names.",
        technicalDetails:
          "Identified by analyzing method declarations and filtering out standard Java methods, getters/setters, and common abbreviations.",
        securityRisks: [
          "Makes reverse engineering analysis difficult",
          "Hides malicious function names and purposes",
          "Complicates security auditing processes",
          "May indicate attempt to hide suspicious behavior",
          "Obscures API and interface understanding",
        ],
      },
      short_field_names: {
        name: "Short Field Names",
        icon: "📝",
        severity: "high",
        impact: "Code Readability",
        explanation:
          "Fields with single character names are a strong indicator of name obfuscation. Legitimate code typically uses descriptive field names.",
        technicalDetails:
          "Detected by examining field declarations and excluding common single-letter variables like loop counters and mathematical variables.",
        securityRisks: [
          "Makes data structure analysis difficult",
          "Hides the purpose of stored data",
          "Complicates security auditing",
          "May conceal sensitive information storage",
          "Reduces code documentation value",
        ],
      },
      synthetic_methods: {
        name: "Synthetic Methods",
        icon: "🤖",
        severity: "medium",
        impact: "Code Structure",
        explanation:
          "Synthetic methods are compiler-generated methods that don't exist in the original source code. A high number of these can indicate obfuscation or complex code generation.",
        technicalDetails:
          "Identified by the 'synthetic' modifier in method declarations, which indicates compiler-generated code not present in original source.",
        securityRisks: [
          "Can hide actual program logic",
          "Makes static analysis more difficult",
          "May indicate code generation tools",
          "Can complicate debugging and analysis",
          "Obscures original code structure",
        ],
      },
      access_methods: {
        name: "Synthetic Access Methods",
        icon: "🔐",
        severity: "medium",
        impact: "Access Control",
        explanation:
          "Synthetic access methods (access$XXX) are generated by the compiler to access private members from inner classes. Many of these can indicate obfuscation.",
        technicalDetails:
          "Detected by pattern matching method names starting with 'access$' followed by numbers, which are generated for inner class access.",
        securityRisks: [
          "Can bypass intended access restrictions",
          "Makes access control analysis difficult",
          "May indicate complex inner class structures",
          "Can hide actual data access patterns",
          "Complicates security boundary analysis",
        ],
      },
      obfuscated_packages: {
        name: "Obfuscated Package Names",
        icon: "📦",
        severity: "high",
        impact: "Code Organization",
        explanation:
          "Package names with single characters indicate package name obfuscation. Legitimate packages typically use meaningful, hierarchical names.",
        technicalDetails:
          "Identified by analyzing package declarations for single-character segments that don't follow standard Java naming conventions.",
        securityRisks: [
          "Hides the actual organization of code",
          "Makes package-based security analysis difficult",
          "Can conceal malicious package structures",
          "Complicates dependency analysis",
          "Obscures code architecture understanding",
        ],
      },
      dollar_classes: {
        name: "Inner Classes with Obfuscated Names",
        icon: "🎭",
        severity: "medium",
        impact: "Class Structure",
        explanation:
          "Inner classes with dollar signs and short names often indicate obfuscated inner class structures used to hide implementation details.",
        technicalDetails:
          "Detected by analyzing class names containing '$' symbols with short or meaningless names, excluding standard anonymous class patterns.",
        securityRisks: [
          "Can hide complex class relationships",
          "Makes inner class analysis difficult",
          "May conceal callback mechanisms",
          "Can hide event handling logic",
          "Obscures object-oriented design patterns",
        ],
      },
      reflection: {
        name: "Dynamic Reflection Usage",
        icon: "🪞",
        severity: "medium",
        impact: "Runtime Behavior",
        explanation:
          "Excessive use of Java reflection allows code to dynamically access classes and methods at runtime, making static analysis difficult and potentially hiding malicious behavior.",
        technicalDetails:
          "Identified by detecting calls to reflection APIs like Class.forName, getMethod, getDeclaredMethod, and invoke operations.",
        securityRisks: [
          "Bypasses compile-time security checks",
          "Can access private methods and fields",
          "Makes malware detection more difficult",
          "Enables dynamic code loading and execution",
          "Can circumvent security policies",
        ],
      },
      string_encryption: {
        name: "String Encryption/Encoding",
        icon: "🔐",
        severity: "high",
        impact: "Data Hiding",
        explanation:
          "Encrypted or encoded strings hide sensitive information like URLs, API keys, or malicious commands from static analysis tools.",
        technicalDetails:
          "Detected by identifying patterns of string manipulation involving encryption, decryption, encoding, or decoding operations.",
        securityRisks: [
          "Hides malicious URLs and endpoints",
          "Conceals sensitive API keys and tokens",
          "Makes network traffic analysis difficult",
          "Can hide command and control communications",
          "Obscures configuration and settings",
        ],
      },
      base64_strings: {
        name: "Base64 Encoded Strings",
        icon: "📝",
        severity: "medium",
        impact: "Data Encoding",
        explanation: "Base64 encoded strings can hide sensitive data, URLs, or commands from simple text analysis.",
        technicalDetails:
          "Identified by pattern matching strings that conform to Base64 encoding format with sufficient length to indicate intentional encoding.",
        securityRisks: [
          "Hides sensitive configuration data",
          "Can conceal malicious URLs",
          "Makes static analysis more difficult",
          "May hide encrypted payloads",
          "Obscures embedded resources",
        ],
      },
      hex_strings: {
        name: "Hexadecimal Encoded Strings",
        icon: "🔢",
        severity: "medium",
        impact: "Data Encoding",
        explanation:
          "Hexadecimal encoded strings can hide binary data, encryption keys, or other sensitive information.",
        technicalDetails:
          "Detected by identifying string literals containing only hexadecimal characters with sufficient length to indicate intentional encoding.",
        securityRisks: [
          "Conceals binary payloads",
          "Hides encryption keys",
          "Makes pattern detection difficult",
          "Can hide shellcode or exploits",
          "Obscures cryptographic material",
        ],
      },
      proguard_signatures: {
        name: "ProGuard Compilation Signatures",
        icon: "⚙️",
        severity: "low",
        impact: "Build Process",
        explanation:
          "ProGuard signatures indicate the code has been processed by ProGuard, a common obfuscation and optimization tool.",
        technicalDetails:
          "Identified by detecting ProGuard-specific comments and signatures in compiled code that indicate processing by the obfuscation tool.",
        securityRisks: [
          "Indicates intentional code obfuscation",
          "May hide original source structure",
          "Can make debugging more difficult",
          "Suggests commercial or protected code",
          "May indicate intellectual property protection",
        ],
      },
    }

    return (
      indicators[type] || {
        name: type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
        icon: "⚠️",
        severity: "unknown",
        impact: "Unknown",
        explanation: "This obfuscation technique was detected but detailed analysis is not available.",
        technicalDetails:
          "Pattern detected through heuristic analysis but specific technical details are not available for this indicator type.",
        securityRisks: ["Unknown security implications", "Requires manual analysis for proper assessment"],
      }
    )
  }

  updateManifestContent(manifest) {
    this.elements.manifestContent.innerHTML = `
      <div class="code-display">${this.escapeHtml(manifest.content || "Could not load manifest content")}</div>
    `
  }

  updateFileStructure(fileStructure) {
    this.elements.fileStructure.innerHTML = fileStructure.join("<br>") || "Could not load file structure"
  }

  getFindingIcon(type) {
    switch (type) {
      case "warning":
        return '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>'
      case "success":
        return '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>'
      case "error":
        return '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>'
      default:
        return '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>'
    }
  }

  escapeHtml(html) {
    const div = document.createElement("div")
    div.textContent = html
    return div.innerHTML
  }

  updateFileName(name) {
    console.log("Updating file name display:", name)
    if (this.elements.fileName) {
      this.elements.fileName.textContent = name
      this.elements.fileName.style.display = "block"
      console.log("File name display updated and shown")
    }
  }

  hideFileName() {
    console.log("Hiding file name display")
    if (this.elements.fileName) {
      this.elements.fileName.style.display = "none"
      this.elements.fileName.textContent = ""
    }
  }

  setDragging(isDragging) {
    if (isDragging) {
      this.elements.uploadArea.classList.add("dragging")
      console.log("Added dragging class")
    } else {
      this.elements.uploadArea.classList.remove("dragging")
      console.log("Removed dragging class")
    }
  }
}

/**
 * FIXED File Uploader class - handles file uploads and validation
 */
class FileUploader {
  constructor(elements, uiManager) {
    this.elements = elements
    this.uiManager = uiManager
    this.initEventListeners()
    this.setupGlobalDragPrevention()
  }

  setupGlobalDragPrevention() {
    document.addEventListener("dragover", (e) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = "none"
    })

    document.addEventListener("drop", (e) => {
      if (!this.elements.uploadArea.contains(e.target)) {
        e.preventDefault()
        console.log("Prevented browser default file drop")
      }
    })

    window.addEventListener("dragover", (e) => {
      e.preventDefault()
    })

    window.addEventListener("drop", (e) => {
      e.preventDefault()
    })
  }

  initEventListeners() {
    this.elements.fileInput.addEventListener("change", (e) => {
      console.log("File input changed:", e.target.files)
      if (e.target.files && e.target.files.length > 0) {
        const file = e.target.files[0]
        console.log("Selected file:", file.name, "Size:", file.size)
        if (this.isValidFile(file)) {
          this.uiManager.updateFileName(file.name)
          this.uiManager.hideMessage()
          console.log("Valid file selected and name displayed")
        } else {
          this.uiManager.showMessage("Please select a valid APK file.", "error")
          this.uiManager.hideFileName()
          this.elements.fileInput.value = ""
        }
      } else {
        console.log("No file selected")
        this.uiManager.hideFileName()
      }
    })

    this.elements.uploadArea.addEventListener("dragenter", (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.uiManager.setDragging(true)
      console.log("Drag enter upload area")
    })

    this.elements.uploadArea.addEventListener("dragover", (e) => {
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = "copy"
      this.uiManager.setDragging(true)
      console.log("Drag over upload area")
    })

    this.elements.uploadArea.addEventListener("dragleave", (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (!this.elements.uploadArea.contains(e.relatedTarget)) {
        this.uiManager.setDragging(false)
        console.log("Drag leave upload area")
      }
    })

    this.elements.uploadArea.addEventListener("drop", (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.uiManager.setDragging(false)
      console.log("File dropped on upload area")

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0]
        console.log("Dropped file:", file.name, "Type:", file.type, "Size:", file.size)

        if (this.isValidFile(file)) {
          this.setFileInput(file)
          this.uiManager.showMessage(`File "${file.name}" ready for analysis`, "success")
          console.log("Valid APK file dropped and processed")
        } else {
          this.uiManager.showMessage("Please upload a valid APK file (.apk extension required).", "error")
          console.log("Invalid file type dropped")
        }
      } else {
        console.log("No files in drop event")
        this.uiManager.showMessage("No files detected. Please try again.", "error")
      }
    })

    this.elements.uploadArea.addEventListener("click", (e) => {
      if (e.target.classList.contains("browse-text") || e.target === this.elements.fileInput) {
        return
      }
      console.log("Upload area clicked")
      this.elements.fileInput.click()
    })

    const browseLink = document.querySelector(".browse-text")
    if (browseLink) {
      browseLink.addEventListener("click", (e) => {
        e.preventDefault()
        e.stopPropagation()
        console.log("Browse files clicked")
        this.elements.fileInput.click()
      })
    }
  }

  isValidFile(file) {
    console.log("Validating file:", file.name, "Type:", file.type)

    const allowedExtensions = [".apk"]
    const fileName = file.name.toLowerCase()
    const hasValidExtension = allowedExtensions.some((ext) => fileName.endsWith(ext))

    const hasValidMimeType =
      file.type === "application/vnd.android.package-archive" || file.type === "application/zip" || file.type === ""

    console.log("Extension valid:", hasValidExtension, "MIME type:", file.type)

    return hasValidExtension
  }

  validateFile() {
    console.log("Validating file...")
    console.log("Files in input:", this.elements.fileInput.files.length)

    if (!this.elements.fileInput.files.length) {
      this.uiManager.showMessage("Please select an APK file.", "error")
      return false
    }

    const file = this.elements.fileInput.files[0]
    console.log("Validating file:", file.name, "Size:", file.size)

    if (!this.isValidFile(file)) {
      this.uiManager.showMessage("Please upload a valid APK file.", "error")
      return false
    }

    const maxSizeInMB = 100
    const maxSizeInBytes = maxSizeInMB * 1024 * 1024
    if (file.size > maxSizeInBytes) {
      this.uiManager.showMessage(`File size exceeds ${maxSizeInMB}MB limit.`, "error")
      return false
    }

    console.log("File validation passed")
    return true
  }

  setFileInput(file) {
    console.log("Setting file input with:", file.name)

    try {
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(file)
      this.elements.fileInput.files = dataTransfer.files

      this.uiManager.updateFileName(file.name)
      this.uiManager.hideMessage()

      console.log("File input set successfully")
    } catch (error) {
      console.error("Error setting file input:", error)
      this.uiManager.updateFileName(file.name)
      this.uiManager.showMessage("File selected. You may need to click 'Browse files' to confirm.", "warning")
    }
  }
}

// Global functions
function showUploadPage() {
  if (window.apkAnalyzer && window.apkAnalyzer.uiManager) {
    window.apkAnalyzer.uiManager.showPage("upload")
    window.apkAnalyzer.resetUploadForm()
  }
}

function showSummaryPage() {
  if (window.apkAnalyzer && window.apkAnalyzer.uiManager) {
    window.apkAnalyzer.uiManager.showPage("summary")
  }
}

function showDetailPage() {
  if (window.apkAnalyzer && window.apkAnalyzer.showDetailPage) {
    window.apkAnalyzer.showDetailPage()
  }
}

function showTab(tabName) {
  document.querySelectorAll(".tab-content").forEach((tab) => {
    tab.classList.remove("active")
  })

  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.remove("active")
  })

  const targetTab = document.getElementById(`${tabName}Tab`)
  if (targetTab) {
    targetTab.classList.add("active")
  }

  if (event && event.target) {
    event.target.classList.add("active")
  }
}

function downloadReport() {
  if (window.apkAnalyzer && window.apkAnalyzer.analysisData) {
    const dataStr = JSON.stringify(window.apkAnalyzer.analysisData, null, 2)
    const dataBlob = new Blob([dataStr], { type: "application/json" })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement("a")
    link.href = url
    link.download = "apk-analysis-report.json"
    link.click()
    URL.revokeObjectURL(url)
  } else {
    alert("No analysis data available to download")
  }
}

// Global pagination function for obfuscated code
function changeObfuscationPage(direction) {
  console.log(`changeObfuscationPage called with direction: ${direction}`)

  const pagination = window.obfuscationPagination
  if (!pagination) {
    console.error("No pagination data available")
    return
  }

  const newPage = pagination.currentPage + direction
  const totalPages = Math.ceil(pagination.allSnippets.length / pagination.snippetsPerPage)

  console.log(`Current page: ${pagination.currentPage}, New page: ${newPage}, Total pages: ${totalPages}`)

  if (newPage >= 1 && newPage <= totalPages) {
    window.apkAnalyzer.uiManager.displayObfuscationPage(newPage)
  } else {
    console.log("Page out of bounds")
  }
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  const io = window.io
  if (typeof io === "undefined") {
    console.error("Socket.IO library is not loaded. Ensure it's included in your HTML.")
  } else {
    new APKAnalyzer(io)
  }
})
