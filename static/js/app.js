/**
 * APK Analyzer Application - Compatible with existing Flask backend
 */

class APKAnalyzer {
  constructor() {
    this.analysisData = null // Stores all analysis results
    this.initElements() // Initializes DOM elements
    this.initComponents() // Initializes helper components (SocketManager, UIManager, FileUploader)
    this.initEventListeners() // Initializes event listeners

    // Make sure this instance is available globally for global functions to access
    window.apkAnalyzer = this
  }

  // Initializes references to HTML elements by their IDs
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
      progressFill: document.getElementById("progressFill"), // For the progress bar

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

      // Common elements (messages)
      messageContainer: document.getElementById("messageContainer"),
      messageIcon: document.getElementById("messageIcon"),
      messageText: document.getElementById("messageText"),
    }
  }

  // Initializes instances of helper classes
  initComponents() {
    this.socketManager = new SocketManager() // Manages WebSocket communication
    this.uiManager = new UIManager(this.elements) // Manages all UI updates
    this.fileUploader = new FileUploader(this.elements, this.uiManager) // Manages file upload functionality
  }

  // Sets up event listeners for form submission and WebSocket events
  initEventListeners() {
    // Listener for upload form submission
    this.elements.uploadForm.addEventListener("submit", this.handleFormSubmit.bind(this))

    // Socket.IO event listeners from the backend
    this.socketManager.on("status", this.handleStatusUpdate.bind(this))
    this.socketManager.on("permissions", this.handlePermissionsReceived.bind(this))
    this.socketManager.on("obfuscation", this.handleObfuscationResults.bind(this))
    this.socketManager.on("analysis_complete", this.handleAnalysisComplete.bind(this))
    this.socketManager.on("analysis_status", this.handleAnalysisStatus.bind(this))
    this.socketManager.on("analysis_progress", this.handleAnalysisProgress.bind(this))
  }

  // Handler for generic status updates from the server
  handleStatusUpdate(data) {
    console.log("Status update:", data)
    // Can be used for additional logging or debugging
  }

  // Handler for analysis status updates (informative messages)
  handleAnalysisStatus(data) {
    console.log("Analysis status:", data)
    if (data.message) {
      this.uiManager.showMessage(data.message, "info")
    }
  }

  // Handler for analysis progress updates
  handleAnalysisProgress(data) {
    console.log("Analysis progress:", data)
    if (data.progress !== undefined) {
      this.elements.progressFill.style.width = `${data.progress}%` // Fills the progress bar
    }
    if (data.message) {
      const loadingText = document.querySelector(".loading-text")
      if (loadingText) {
        loadingText.textContent = data.message // Updates the text below the progress bar
      }
    }
  }

  // Handler when the upload form is submitted
  handleFormSubmit(e) {
    e.preventDefault() // Prevents page reload

    if (!this.fileUploader.validateFile()) { // Validates the selected file
      return
    }

    // Start loading state
    this.uiManager.setLoading(true)
    this.uiManager.showMessage("Processing your APK file...", "info")
    // Hide previous permissions results if any (UIManager does not have hidePermissions)
    // You might want to add this to UIManager if needed.

    this.uploadFile() // Starts the file upload process
  }

  // Uploads the APK file to the server
  async uploadFile() {
    try {
      const formData = new FormData(this.elements.uploadForm) // Gets form data

      const response = await fetch("/upload", { // Sends POST request to /upload endpoint
        method: "POST",
        body: formData,
      })

      const result = await response.json() // Parses the JSON response

      if (!response.ok) { // If response is not OK (HTTP error)
        throw new Error(result.error || "An error occurred during upload")
      }

      // Store the filename for later use
      this.currentFileName = this.elements.fileInput.files[0].name

      // If we got complete data in the response, use it immediately
      // This is for cases where the analysis is very fast and backend sends complete_data in HTTP response
      if (result.complete_data) {
        this.analysisData = result.complete_data

        // Store code snippets globally for pagination
        if (this.analysisData.obfuscation && this.analysisData.obfuscation.code_snippets) {
          window.currentObfuscationSnippets = this.analysisData.obfuscation.code_snippets
          console.log(`Stored ${this.analysisData.obfuscation.code_snippets.length} code snippets for pagination`)
        }

        this.showSummaryPage() // Directly show summary page
        return
      }

      // Otherwise, initialize analysis data structure and wait for socket events
      // This path is taken if backend responds quickly but analysis is still ongoing (updates via WebSocket)
      this.analysisData = {
        fileName: this.currentFileName,
        permissions: [],
        obfuscation: { is_obfuscated: false, confidence: 0, code_snippets: [] },
        apkInfo: { name: this.currentFileName },
        // These will be updated by handleAnalysisComplete/handlePermissionsReceived/handleObfuscationResults
        apk_size_mb: null,       # [ADDED]
        runtime_seconds: null,   # [ADDED]
        runtime_display: null    # [ADDED]
      }

      this.uiManager.showMessage("Analysis started. Please wait...", "info")

      // Set a timeout to check if analysis completes within reasonable time
      this.analysisTimeout = setTimeout(() => {
        this.uiManager.showMessage("Analysis is taking longer than expected. Checking results...", "warning")
        this.checkAnalysisStatus() // Call status check function
      }, 30000) // 30 seconds timeout for real analysis
    }
    catch (error) {
      this.uiManager.showMessage(`Error: ${error.message}`, "error") // Displays error message
      this.uiManager.setLoading(false) // Stops loading
    }
  }

  // Method to check analysis status if timeout occurs or for manual check
  checkAnalysisStatus() {
    // If we have some data from socket events, show summary
    if (
      this.analysisData &&
      (this.analysisData.permissions.length > 0 || this.analysisData.obfuscation.is_obfuscated !== undefined)
    ) {
      this.showSummaryPage()
    } else {
      // Force show summary with whatever data we have
      this.uiManager.showMessage("Analysis completed. Displaying available results...", "info")
      this.showSummaryPage()
    }
  }

  // Handler when complete analysis data is received from the server (via Socket.IO)
  handleAnalysisComplete(data) {
    console.log("Analysis complete:", data)

    // Clear the timeout
    if (this.analysisTimeout) {
      clearTimeout(this.analysisTimeout)
    }

    // [MODIFIED] Merge all received data. 'data.results' should contain the full analysis_results object
    if (this.analysisData) {
      this.analysisData = { ...this.analysisData, ...(data.results || data) } // Merge data.results if it exists, otherwise data
    } else {
      this.analysisData = data.results || data // Assign data.results if it exists, otherwise data
    }

    // Store code snippets globally for pagination
    if (this.analysisData.obfuscation && this.analysisData.obfuscation.code_snippets) {
      window.currentObfuscationSnippets = this.analysisData.obfuscation.code_snippets
      console.log(`Stored ${this.analysisData.obfuscation.code_snippets.length} code snippets for pagination`)
    }

    this.showSummaryPage() // Show summary page
  }

  // Handler when permissions data is received from the server
  handlePermissionsReceived(data) {
    console.log("Permissions received:", data)
    if (this.analysisData) {
      this.analysisData.permissions = data.permissions || []

      // If we have both permissions and obfuscation data, and still on upload page, show summary
      if (this.analysisData.permissions.length > 0 && this.analysisData.obfuscation) {
        setTimeout(() => {
          // Check if user is still on the upload page before switching to summary
          if (this.elements.uploadPage.classList.contains("active")) {
            this.showSummaryPage()
          }
        }, 2000) // Wait 2 seconds for any additional data
      }
    }
  }

  // Handler when obfuscation results are received from the server
  handleObfuscationResults(data) {
    console.log("Obfuscation results received:", data)
    if (this.analysisData) {
      this.analysisData.obfuscation = data

      // Store code snippets globally for pagination
      if (data.code_snippets) {
        window.currentObfuscationSnippets = data.code_snippets
        console.log(`Stored ${data.code_snippets.length} real obfuscation code snippets for pagination`)
      }

      // If we have both permissions and obfuscation data, and still on upload page, show summary
      if (this.analysisData.permissions.length > 0 && this.analysisData.obfuscation) {
        setTimeout(() => {
          // Check if user is still on the upload page before switching to summary
          if (this.elements.uploadPage.classList.contains("active")) {
            this.showSummaryPage()
          }
        }, 2000) // Wait 2 seconds for any additional data
      }
    }
  }

  // Displays the summary page
  showSummaryPage() {
    this.uiManager.setLoading(false) // Hide loading indicator
    this.uiManager.hideMessage() // Hide messages
    this.uiManager.showPage("summary") // Switch to summary page
    this.populateSummaryPage() // Populate data on the summary page
  }

  // Displays the detail page
  showDetailPage() {
    console.log("APKAnalyzer.showDetailPage called")
    console.log("Analysis data available:", !!this.analysisData)

    if (!this.analysisData) {
      this.uiManager.showMessage("No analysis data available. Please run an analysis first.", "warning")
      return
    }

    this.uiManager.showPage("detail") // Switch to detail page
    this.populateDetailPage() // Populate data on the detail page
  }

  // Resets the upload form to initial state
  resetUploadForm() {
    console.log("Resetting upload form...")

    // Reset the file input
    this.elements.fileInput.value = ""

    // Hide the file name display
    this.uiManager.hideFileName()

    // Reset the form
    this.elements.uploadForm.reset()

    // Clear any messages
    this.uiManager.hideMessage()

    // Reset loading state
    this.uiManager.setLoading(false)

    // Clear analysis data
    this.analysisData = null

    // Clear global obfuscation snippets
    window.currentObfuscationSnippets = null

    console.log("Upload form reset complete")
  }

  // Populates data on the summary page
  populateSummaryPage() {
    if (!this.analysisData) {
      this.showPlaceholderSummary() // Show placeholder if no data
      return
    }

    const data = this.analysisData

    // Set APK name
    this.elements.apkName.textContent = data.fileName || data.apkInfo?.name || "Unknown APK"

    // Calculate and display security score
    const securityScore = this.calculateSecurityScore(data)
    this.uiManager.updateSecurityScore(securityScore)

    // APK Info
    // Pass the entire analysisData to updateApkInfo to access apk_size_mb and runtime_display
    // [MODIFIED] Pass the entire data object which now contains apk_size_mb, runtime_display, etc.
    this.uiManager.updateApkInfo(data.apkInfo || { name: data.fileName }, data)

    // Permissions Summary
    const permissionsSummary = this.calculatePermissionsSummary(data.permissions || [])
    this.uiManager.updatePermissionsSummary(permissionsSummary)

    // Obfuscation Status
    this.uiManager.updateObfuscationStatus(data.obfuscation || { is_obfuscated: false, confidence: 0 })

    // Key Findings
    const keyFindings = this.generateKeyFindings(data)
    this.uiManager.updateKeyFindings(keyFindings)
  }

  // Populates data on the detail page
  populateDetailPage() {
    if (!this.analysisData) {
      this.showPlaceholderDetail()
      return
    }

    const data = this.analysisData

    // Set APK name
    this.elements.detailApkName.textContent = data.fileName || data.apkInfo?.name || "Unknown APK"

    // Populate detail tabs
    this.uiManager.updatePermissionsList(data.permissions || [])
    this.uiManager.updateObfuscationDetails(data.obfuscation || { is_obfuscated: false, code_snippets: [] })
    this.uiManager.updateManifestContent({ content: data.manifest || "Manifest data not available" })
    this.uiManager.updateFileStructure(data.fileStructure || ["File structure not available"])
  }

  // Calculates the security score for the APK
  calculateSecurityScore(data) {
    let score = 100
    const permissions = data.permissions || []

    // Deduct points for dangerous permissions
    const dangerousCount = permissions.filter(
      (p) =>
        p.protection_level === "dangerous" ||
        p.name?.includes("CAMERA") ||
        p.name?.includes("LOCATION") ||
        p.name?.includes("CONTACTS"),
    ).length

    score -= dangerousCount * 5 // Deduct points for dangerous permissions

    // Deduct points for obfuscation
    if (data.obfuscation?.is_obfuscated) {
      score -= 20
    }

    score = Math.max(0, Math.min(100, score)) // Ensures score is between 0 and 100

    let level = "Low"
    if (score >= 80) level = "High"
    else if (score >= 60) level = "Medium"

    return { score, level }
  }

  // Calculates a summary of permissions (count of dangerous, normal, etc.)
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

  // Generates key security findings based on analysis data
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

  // Shows placeholder data on the summary page while analysis is in progress
  showPlaceholderSummary() {
    this.elements.apkName.textContent = "Analysis in progress..."
    this.uiManager.updateSecurityScore({ score: 0, level: "Analyzing" })
    this.uiManager.showMessage("Waiting for analysis results...", "info")
  }

  // Shows placeholder data on the detail page while analysis is in progress
  showPlaceholderDetail() {
    this.elements.detailApkName.textContent = "Analysis in progress..."
    this.uiManager.showMessage("Waiting for detailed analysis results...", "info")
  }
}

// Global functions for navigation (accessed from HTML)
function showUploadPage() {
  console.log("showUploadPage called")
  if (window.apkAnalyzer && window.apkAnalyzer.uiManager) {
    window.apkAnalyzer.uiManager.showPage("upload")

    // Reset the upload form when returning to upload page
    window.apkAnalyzer.resetUploadForm()

    console.log("Returned to upload page and reset form")
  } else {
    console.error("APK Analyzer not properly initialized")
  }
}

function showSummaryPage() {
  console.log("showSummaryPage called")
  if (window.apkAnalyzer && window.apkAnalyzer.uiManager) {
    window.apkAnalyzer.uiManager.showPage("summary")
  } else {
    console.error("APK Analyzer not properly initialized")
  }
}

function showDetailPage() {
  console.log("showDetailPage called")
  console.log("window.apkAnalyzer exists:", !!window.apkAnalyzer)

  if (window.apkAnalyzer && window.apkAnalyzer.showDetailPage) {
    console.log("Calling APKAnalyzer.showDetailPage()")
    window.apkAnalyzer.showDetailPage()
  } else {
    console.error("APK Analyzer not properly initialized or showDetailPage method not found")
    alert("Application not ready. Please refresh the page and try again.")
  }
}

// Global function to show a specific tab on the detail page
function showTab(tabName) {
  console.log("showTab called with:", tabName)

  // Hide all tab contents
  document.querySelectorAll(".tab-content").forEach((tab) => {
    tab.classList.remove("active")
  })

  // Hide all tab buttons
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.remove("active")
  })

  // Show selected tab
  const targetTab = document.getElementById(`${tabName}Tab`)
  if (targetTab) {
    targetTab.classList.add("active")
  }

  // Set active button
  if (event && event.target) {
    event.target.classList.add("active")
  }
}

// Global function to download the analysis report as JSON
function downloadReport() {
  console.log("downloadReport called")

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

/**
 * Socket Manager class - works with your existing socket events
 */
class SocketManager {
  constructor() {
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
 * UI Manager class - handles all UI updates
 */
class UIManager {
  constructor(elements) {
    this.elements = elements
  }

  showPage(pageName) {
    console.log("UIManager.showPage called with:", pageName)

    // Hide all pages
    document.querySelectorAll(".page").forEach((page) => {
      page.classList.remove("active")
    })

    // Show selected page
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

    // Remove all existing classes
    this.elements.messageContainer.classList.remove("error", "success", "info", "warning")

    // Add the appropriate class
    this.elements.messageContainer.classList.add(type)

    // Set appropriate icon
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

  // [MODIFIED] Update Apk Info to show size and runtime
  updateApkInfo(apkInfo, analysisData) { // Added analysisData parameter
    // Use data from analysisData if available, otherwise fallback to apkInfo or "Unknown"
    const nameDisplay = analysisData?.apk_name || apkInfo.name || "Unknown";
    const packageDisplay = analysisData?.apkInfo?.package_name || apkInfo.package_name || "Unknown";
    const versionDisplay = analysisData?.apkInfo?.version_name || apkInfo.version_name || "Unknown";
    const sizeDisplay = analysisData?.apk_size_mb ? `${analysisData.apk_size_mb} MB` : (apkInfo.size || "Unknown");
    const runtimeDisplay = analysisData?.runtime_display || "N/A";

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
    `;
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
    </div>
  `
    }

    // Enhanced indicators section with detailed explanations
    if (obfuscation.indicators && obfuscation.indicators.length > 0) {
      html += `
    <div class="indicators-section">
      <h4>🚨 Obfuscation Indicators Found</h4>
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
        </div>

        <div class="indicator-description">
          <h5>Why this indicates obfuscation:</h5>
          <p>${indicatorDetails.explanation}</p>
        </div>

        <div class="security-implications">
          <h5>Security Implications:</h5>
          <ul>
            ${indicatorDetails.securityRisks.map((risk) => `<li>${risk}</li>`).join("")}
          </ul>
        </div>
      </div>
    `
      })

      html += `
      </div>
    </div>
  `
    }

    // Add real obfuscated code snippets section with pagination
    if (codeSnippets.length > 0) {
      html += this.generateRealObfuscatedCodeSection(codeSnippets)
    }

    // Add recommendations section
    if (isObfuscated) {
      html += `
    <div class="recommendations-section">
      <h4>🛡️ Security Recommendations</h4>
      <div class="recommendations-grid">
        <div class="recommendation-card high-priority">
          <h5>🔴 High Priority</h5>
          <ul>
            <li>Verify the app source and developer reputation</li>
            <li>Check app permissions carefully before installation</li>
            <li>Monitor app behavior after installation</li>
          </ul>
        </div>
        <div class="recommendation-card medium-priority">
          <h5>🟡 Medium Priority</h5>
          <ul>
            <li>Use additional security scanning tools</li>
            <li>Check for similar apps with better transparency</li>
            <li>Review user reviews and ratings</li>
            <li>Keep your device and security software updated</li>
          </ul>
        </div>
        <div class="recommendation-card low-priority">
          <h5>🟢 General Security</h5>
          <ul>
            <li>Use app sandboxing when possible</li>
            <li>Regular security audits of installed apps</li>
          </ul>
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
        </div>
      </div>
      
      <div class="pagination-controls top-pagination">
        <button class="pagination-btn" id="prevBtn" onclick="changeObfuscationPage(-1)" disabled>
          <svg class="icon" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>
          Previous
        </button>
        <div class="page-info">
          <span>Page <span id="currentPage">1</span> of <span id="totalPages">${totalPages}</span></span>
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
            <span class="file-path">${snippet.file || "Unknown file"}</span>
            <span class="line-number">Lines ${snippet.line_start || "?"}-${snippet.line_end || "?"}</span>
          </div>
        </div>
        
        <div class="real-code-snippet">
          <div class="code-block">
            <h6>Detected Pattern: ${snippet.matched_text ? this.escapeHtml(snippet.matched_text) : "Pattern match"}</h6>
            <pre><code>${this.escapeHtml(snippet.code_snippet || snippet.matched_line || "Code not available")}</code></pre>
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
    // FIXED: Added all the new Smali-specific pattern types
    const indicators = {
      short_class_names: {
        name: "Short Class Names",
        icon: "🏷️",
        severity: "high",
        impact: "Code Readability",
        explanation:
          "Classes with extremely short names (1-2 characters) are a strong indicator of name obfuscation. Legitimate code typically uses descriptive class names that reflect their purpose.",
        securityRisks: [
          "Makes reverse engineering analysis difficult",
          "Hides the actual purpose of classes",
          "Complicates security auditing processes",
          "May indicate attempt to hide malicious functionality",
        ],
      },
      short_method_names: {
        name: "Short Method Names",
        icon: "🔤",
        severity: "high",
        impact: "Code Readability",
        explanation:
          "Methods with extremely short names (1-2 characters) are a strong indicator of name obfuscation. Legitimate code typically uses descriptive method names.",
        securityRisks: [
          "Makes reverse engineering analysis difficult",
          "Hides malicious function names and purposes",
          "Complicates security auditing processes",
          "May indicate attempt to hide suspicious behavior",
        ],
      },
      short_field_names: {
        name: "Short Field Names",
        icon: "📝",
        severity: "high",
        impact: "Code Readability",
        explanation:
          "Fields with single character names are a strong indicator of name obfuscation. Legitimate code typically uses descriptive field names.",
        securityRisks: [
          "Makes data structure analysis difficult",
          "Hides the purpose of stored data",
          "Complicates security auditing",
          "May conceal sensitive information storage",
        ],
      },
      synthetic_methods: {
        name: "Synthetic Methods",
        icon: "🤖",
        severity: "medium",
        impact: "Code Structure",
        explanation:
          "Synthetic methods are compiler-generated methods that don't exist in the original source code. A high number of these can indicate obfuscation or complex code generation.",
        securityRisks: [
          "Can hide actual program logic",
          "Makes static analysis more difficult",
          "May indicate code generation tools",
          "Can complicate debugging and analysis",
        ],
      },
      access_methods: {
        name: "Synthetic Access Methods",
        icon: "🔐",
        severity: "medium",
        impact: "Access Control",
        explanation:
          "Synthetic access methods (access$XXX) are generated by the compiler to access private members from inner classes. Many of these can indicate obfuscation.",
        securityRisks: [
          "Can bypass intended access restrictions",
          "Makes access control analysis difficult",
          "May indicate complex inner class structures",
          "Can hide actual data access patterns",
        ],
      },
      obfuscated_packages: {
        name: "Obfuscated Package Names",
        icon: "📦",
        severity: "high",
        impact: "Code Organization",
        explanation:
          "Package names with single characters indicate package name obfuscation. Legitimate packages typically use meaningful, hierarchical names.",
        securityRisks: [
          "Hides the actual organization of code",
          "Makes package-based security analysis difficult",
          "Can conceal malicious package structures",
          "Complicates dependency analysis",
        ],
      },
      dollar_classes: {
        name: "Inner Classes with Obfuscated Names",
        icon: "🎭",
        severity: "medium",
        impact: "Class Structure",
        explanation:
          "Inner classes with dollar signs and short names often indicate obfuscated inner class structures used to hide implementation details.",
        securityRisks: [
          "Can hide complex class relationships",
          "Makes inner class analysis difficult",
          "May conceal callback mechanisms",
          "Can hide event handling logic",
        ],
      },
      reflection: {
        name: "Dynamic Reflection Usage",
        icon: "🪞",
        severity: "medium",
        impact: "Runtime Behavior",
        explanation:
          "Excessive use of Java reflection allows code to dynamically access classes and methods at runtime, making static analysis difficult and potentially hiding malicious behavior.",
        securityRisks: [
          "Bypasses compile-time security checks",
          "Can access private methods and fields",
          "Makes malware detection more difficult",
          "Enables dynamic code loading and execution",
        ],
      },
      string_encryption: {
        name: "String Encryption/Encoding",
        icon: "🔐",
        severity: "high",
        impact: "Data Hiding",
        explanation:
          "Encrypted or encoded strings hide sensitive information like URLs, API keys, or malicious commands from static analysis tools.",
        securityRisks: [
          "Hides malicious URLs and endpoints",
          "Conceals sensitive API keys and tokens",
          "Makes network traffic analysis difficult",
          "Can hide command and control communications",
        ],
      },
      base64_strings: {
        name: "Base64 Encoded Strings",
        icon: "📝",
        severity: "medium",
        impact: "Data Encoding",
        explanation: "Base64 encoded strings can hide sensitive data, URLs, or commands from simple text analysis.",
        securityRisks: [
          "Hides sensitive configuration data",
          "Can conceal malicious URLs",
          "Makes static analysis more difficult",
          "May hide encrypted payloads",
        ],
      },
      hex_strings: {
        name: "Hexadecimal Encoded Strings",
        icon: "🔢",
        severity: "medium",
        impact: "Data Encoding",
        explanation:
          "Hexadecimal encoded strings can hide binary data, encryption keys, or other sensitive information.",
        securityRisks: [
          "Conceals binary payloads",
          "Hides encryption keys",
          "Makes pattern detection difficult",
          "Can hide shellcode or exploits",
        ],
      },
      proguard_signatures: {
        name: "ProGuard Compilation Signatures",
        icon: "⚙️",
        severity: "low",
        impact: "Build Process",
        explanation:
          "ProGuard signatures indicate the code has been processed by ProGuard, a common obfuscation and optimization tool.",
        securityRisks: [
          "Indicates intentional code obfuscation",
          "May hide original source structure",
          "Can make debugging more difficult",
          "Suggests commercial or protected code",
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
        securityRisks: ["Unknown security implications"],
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

  // File uploader methods
  updateFileName(name) {
    console.log("Updating file name display:", name)
    if (this.elements.fileName) {
      this.elements.fileName.textContent = name
      this.elements.fileName.style.display = "block"
      console.log("File name display updated and shown")
    } else {
      console.error("fileName element not found")
    }
  }

  hideFileName() {
    console.log("Hiding file name display")
    if (this.elements.fileName) {
      this.elements.fileName.style.display = "none"
      this.elements.fileName.textContent = ""
      console.log("File name display hidden")
    }
  }

  setDragging(isDragging) {
    if (isDragging) {
      this.elements.uploadArea.classList.add("dragging")
    } else {
      this.elements.uploadArea.classList.remove("dragging")
    }
  }
}

/**
 * File Uploader class - handles file uploads and validation
 */
class FileUploader {
  constructor(elements, uiManager) {
    this.elements = elements
    this.uiManager = uiManager
    this.initEventListeners()
  }

  initEventListeners() {
    // File input change event - fix this
    this.elements.fileInput.addEventListener("change", (e) => {
      console.log("File input changed:", e.target.files)
      if (e.target.files && e.target.files.length > 0) {
        const file = e.target.files[0]
        console.log("Selected file:", file.name, "Size:", file.size)
        if (this.isValidFile(file)) {
          this.uiManager.updateFileName(file.name)
          this.uiManager.hideMessage() // Clear any previous error messages
          console.log("Valid file selected and name displayed")
        } else {
          this.uiManager.showMessage("Please select a valid APK file.", "error")
          this.uiManager.hideFileName()
          // Clear the invalid file
          this.elements.fileInput.value = ""
        }
      } else {
        console.log("No file selected")
        this.uiManager.hideFileName()
      }
    })

    // Drag and drop events
    this.elements.uploadArea.addEventListener("dragover", (e) => {
      e.preventDefault()
      this.uiManager.setDragging(true)
    })

    this.elements.uploadArea.addEventListener("dragleave", (e) => {
      e.preventDefault()
      this.uiManager.setDragging(false)
    })

    this.elements.uploadArea.addEventListener("drop", (e) => {
      e.preventDefault()
      this.uiManager.setDragging(false)

      if (e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0]
        console.log("Dropped file:", file.name)
        if (this.isValidFile(file)) {
          this.setFileInput(file)
        } else {
          this.uiManager.showMessage("Please upload a valid APK file.", "error")
        }
      }
    })

    // Click on upload area to trigger file input - but not on the browse link
    this.elements.uploadArea.addEventListener("click", (e) => {
      // Don't trigger if clicking on the browse files link
      if (e.target.classList.contains("browse-text")) {
        return
      }
      this.elements.fileInput.click()
    })

    // Add specific click handler for browse files link
    this.elements.fileInput.addEventListener("click", (e) => {
      // Stop the propagation to prevent triggering the uploadArea click
      e.stopPropagation()
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
    const allowedExtensions = [".apk"]
    const fileName = file.name.toLowerCase()
    return allowedExtensions.some((ext) => fileName.endsWith(ext))
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
    // Create a new DataTransfer object
    const dataTransfer = new DataTransfer()

    // Add the file to the DataTransfer object
    dataTransfer.items.add(file)

    // Set the file input's files to the DataTransfer object's files
    this.elements.fileInput.files = dataTransfer.files

    // Update the UI
    this.uiManager.updateFileName(file.name)
    this.uiManager.hideMessage()
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // Check if Socket.IO is available
  if (typeof io === "undefined") {
    console.error("Socket.IO library is not loaded. Ensure it's included in your HTML.")
  } else {
    new APKAnalyzer()
  }
})

// Global pagination function for obfuscated code - FIXED
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
