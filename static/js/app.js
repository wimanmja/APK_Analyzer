/**
 * APK Analyzer Application - FIXED drag and drop functionality
 */

class APKAnalyzer {
  constructor() {
    this.analysisData = null
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
    this.socketManager = new SocketManager()
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
 * UI Manager class
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

  updateObfuscationDetails(obfuscation) {
    const isObfuscated = obfuscation.is_obfuscated
    const confidence = obfuscation.confidence || 0

    this.elements.obfuscationDetails.innerHTML = `
      <div class="obfuscation-summary ${isObfuscated ? "detected" : "not-detected"}">
        <h4>${isObfuscated ? "🔒 Obfuscation Detected" : "✅ No Significant Obfuscation"}</h4>
        <p>Confidence Level: <strong>${confidence}%</strong></p>
      </div>
    `
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
    this.setupGlobalDragPrevention() // ADDED: Prevent browser default drag behavior
  }

  // ADDED: Prevent browser from opening files when dropped outside upload area
  setupGlobalDragPrevention() {
    // Prevent default drag behaviors on document
    document.addEventListener("dragover", (e) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = "none"
    })

    document.addEventListener("drop", (e) => {
      // Only prevent default if not dropping on our upload area
      if (!this.elements.uploadArea.contains(e.target)) {
        e.preventDefault()
        console.log("Prevented browser default file drop")
      }
    })

    // Prevent drag events on window
    window.addEventListener("dragover", (e) => {
      e.preventDefault()
    })

    window.addEventListener("drop", (e) => {
      e.preventDefault()
    })
  }

  initEventListeners() {
    // File input change event
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

    // FIXED: Enhanced drag and drop events with better prevention
    this.elements.uploadArea.addEventListener("dragenter", (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.uiManager.setDragging(true)
      console.log("Drag enter upload area")
    })

    this.elements.uploadArea.addEventListener("dragover", (e) => {
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = "copy" // Show copy cursor
      this.uiManager.setDragging(true)
      console.log("Drag over upload area")
    })

    this.elements.uploadArea.addEventListener("dragleave", (e) => {
      e.preventDefault()
      e.stopPropagation()
      // Only remove dragging state if we're actually leaving the upload area
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

    // Click handlers
    this.elements.uploadArea.addEventListener("click", (e) => {
      // Don't trigger if clicking on the browse files link or file input
      if (e.target.classList.contains("browse-text") || e.target === this.elements.fileInput) {
        return
      }
      console.log("Upload area clicked")
      this.elements.fileInput.click()
    })

    // Browse files link click handler
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

    // Check file extension
    const allowedExtensions = [".apk"]
    const fileName = file.name.toLowerCase()
    const hasValidExtension = allowedExtensions.some((ext) => fileName.endsWith(ext))

    // Additional MIME type check (APK files are ZIP archives)
    const hasValidMimeType =
      file.type === "application/vnd.android.package-archive" || file.type === "application/zip" || file.type === "" // Some browsers don't set MIME type for APK files

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
      // Create a new DataTransfer object
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(file)
      this.elements.fileInput.files = dataTransfer.files

      // Update the UI
      this.uiManager.updateFileName(file.name)
      this.uiManager.hideMessage()

      console.log("File input set successfully")
    } catch (error) {
      console.error("Error setting file input:", error)
      // Fallback: just update the UI without setting the file input
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

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  const io = window.io // Declare the io variable here
  if (typeof io === "undefined") {
    console.error("Socket.IO library is not loaded. Ensure it's included in your HTML.")
  } else {
    new APKAnalyzer(io)
  }
})
