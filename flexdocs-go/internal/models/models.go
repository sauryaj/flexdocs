package models

import "time"

type User struct {
	ID            string     `json:"id"`
	Email         string     `json:"email"`
	Name          *string    `json:"name"`
	Password      *string    `json:"-"`
	Avatar        *string    `json:"avatar"`
	Bio           *string    `json:"bio"`
	Phone         *string    `json:"phone"`
	Timezone      *string    `json:"timezone"`
	Role          string     `json:"role"`
	EmailVerified *time.Time `json:"emailVerified"`
	MFAEnabled    bool       `json:"mfaEnabled"`
	MFASecret     *string    `json:"-"`
	CreatedAt     time.Time  `json:"createdAt"`
	UpdatedAt     time.Time  `json:"updatedAt"`
}

type Document struct {
	ID             string     `json:"id"`
	Title          string     `json:"title"`
	Content        string     `json:"content"`
	Type           string     `json:"type"`
	Category       string     `json:"category"`
	IsPinned       bool       `json:"isPinned"`
	IsArchived     bool       `json:"isArchived"`
	FolderID       *string    `json:"folderId"`
	UserID         string     `json:"userId"`
	OrganizationID *string    `json:"organizationId"`
	Tags           []Tag      `json:"tags,omitempty"`
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`
}

type Password struct {
	ID               string     `json:"id"`
	Name             string     `json:"name"`
	Username         string     `json:"username"`
	Password         string     `json:"password"`
	URL              *string    `json:"url"`
	Notes            *string    `json:"notes"`
	Category         string     `json:"category"`
	IsFavorite       bool       `json:"isFavorite"`
	ExpiresAt        *time.Time `json:"expiresAt"`
	RotationDays     *int       `json:"rotationDays"`
	LastRotatedAt    *time.Time `json:"lastRotatedAt"`
	TOTPSecret       *string    `json:"-"`
	TOTPIssuer       *string    `json:"totpIssuer"`
	TOTPPeriod       int        `json:"totpPeriod"`
	TOTPDigits       int        `json:"totpDigits"`
	CustomFields     string     `json:"customFields"`
	AutofillSelector *string    `json:"autofillSelector"`
	AutofillNotes    *string    `json:"autofillNotes"`
	LastBreachCheck  *time.Time `json:"lastBreachCheck"`
	BreachCount      int        `json:"breachCount"`
	UserID           string     `json:"userId"`
	OrganizationID   *string    `json:"organizationId"`
	Tags             []Tag      `json:"tags,omitempty"`
	CreatedAt        time.Time  `json:"createdAt"`
	UpdatedAt        time.Time  `json:"updatedAt"`
}

type Domain struct {
	ID                string     `json:"id"`
	Name              string     `json:"name"`
	Registrar         *string    `json:"registrar"`
	Nameservers       *string    `json:"nameservers"`
	ExpiresAt         *time.Time `json:"expiresAt"`
	AutoRenew         bool       `json:"autoRenew"`
	Status            string     `json:"status"`
	Notes             *string    `json:"notes"`
	UserID            string     `json:"userId"`
	OrganizationID    *string    `json:"organizationId"`
	WhoisCreated      *string    `json:"whoisCreated"`
	WhoisCountry      *string    `json:"whoisCountry"`
	WhoisState        *string    `json:"whoisState"`
	PrivacyProtection bool       `json:"privacyProtection"`
	DNSRecords        *string    `json:"dnsRecords"`
	LastWhoisCheck    *time.Time `json:"lastWhoisCheck"`
	LastDnsCheck      *time.Time `json:"lastDnsCheck"`
	SSLCertID         *string    `json:"sslCertId"`
	Tags              []Tag      `json:"tags,omitempty"`
	CreatedAt         time.Time  `json:"createdAt"`
	UpdatedAt         time.Time  `json:"updatedAt"`
}

type DomainRevision struct {
	ID        string    `json:"id"`
	DomainID  string    `json:"domainId"`
	Data      string    `json:"data"`
	Source    string    `json:"source"`
	Message   *string   `json:"message"`
	UserID    *string   `json:"userId"`
	CreatedAt time.Time `json:"createdAt"`
}

type Tag struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Color     string    `json:"color"`
	UserID    string    `json:"userId"`
	CreatedAt time.Time `json:"createdAt"`
}

type FlexibleAsset struct {
	ID             string     `json:"id"`
	Name           string     `json:"name"`
	AssetType      string     `json:"assetType"`
	Fields         string     `json:"fields"`
	Notes          *string    `json:"notes"`
	IsArchived     bool       `json:"isArchived"`
	UserID         string     `json:"userId"`
	OrganizationID *string    `json:"organizationId"`
	Tags           []Tag      `json:"tags,omitempty"`
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`
}

type FlexibleAssetType struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Color     string    `json:"color"`
	Icon      string    `json:"icon"`
	Fields    string    `json:"fields"`
	UserID    string    `json:"userId"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type Checklist struct {
	ID             string           `json:"id"`
	Name           string           `json:"name"`
	Description    *string          `json:"description"`
	Category       string           `json:"category"`
	IsComplete     bool             `json:"isComplete"`
	IsArchived     bool             `json:"isArchived"`
	DueDate        *time.Time       `json:"dueDate"`
	UserID         string           `json:"userId"`
	OrganizationID *string          `json:"organizationId"`
	Items          []ChecklistItem  `json:"items,omitempty"`
	Tags           []Tag            `json:"tags,omitempty"`
	CreatedAt      time.Time        `json:"createdAt"`
	UpdatedAt      time.Time        `json:"updatedAt"`
}

type ChecklistItem struct {
	ID          string    `json:"id"`
	Text        string    `json:"text"`
	IsComplete  bool      `json:"isComplete"`
	Order       int       `json:"order"`
	ChecklistID string    `json:"checklistId"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type ActivityLog struct {
	ID           string     `json:"id"`
	UserID       *string    `json:"userId"`
	Action       string     `json:"action"`
	ResourceType *string    `json:"resourceType"`
	ResourceID   *string    `json:"resourceId"`
	ResourceName *string    `json:"resourceName"`
	Details      *string    `json:"details"`
	IP           *string    `json:"ip"`
	UserAgent    *string    `json:"userAgent"`
	CreatedAt    time.Time  `json:"createdAt"`
}

type Organization struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	Description *string    `json:"description"`
	Website     *string    `json:"website"`
	Phone       *string    `json:"phone"`
	Email       *string    `json:"email"`
	Address     *string    `json:"address"`
	Logo        *string    `json:"logo"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
}

type Attachment struct {
	ID          string    `json:"id"`
	Filename    string    `json:"filename"`
	MimeType    string    `json:"mimeType"`
	Size        int       `json:"size"`
	Data        *string   `json:"-"`
	FilePath    *string   `json:"filePath"`
	StorageType string    `json:"storageType"`
	DocumentID  *string   `json:"documentId"`
	UserID      string    `json:"userId"`
	CreatedAt   time.Time `json:"createdAt"`
}

type Webhook struct {
	ID            string     `json:"id"`
	Name          string     `json:"name"`
	URL           string     `json:"url"`
	Secret        *string    `json:"-"`
	Events        string     `json:"events"`
	IsActive      bool       `json:"isActive"`
	LastTriggered *time.Time `json:"lastTriggered"`
	LastStatus    *int       `json:"lastStatus"`
	UserID        string     `json:"userId"`
	CreatedAt     time.Time  `json:"createdAt"`
	UpdatedAt     time.Time  `json:"updatedAt"`
}

type ApiKey struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	Key         string     `json:"key"`
	Permissions string     `json:"permissions"`
	IsActive    bool       `json:"isActive"`
	LastUsedAt  *time.Time `json:"lastUsedAt"`
	ExpiresAt   *time.Time `json:"expiresAt"`
	UserID      string     `json:"userId"`
	CreatedAt   time.Time  `json:"createdAt"`
}

type Session struct {
	ID         string    `json:"id"`
	UserID     string    `json:"userId"`
	Token      string    `json:"token"`
	IP         *string   `json:"ip"`
	UserAgent  *string   `json:"userAgent"`
	LastActive time.Time `json:"lastActive"`
	CreatedAt  time.Time `json:"createdAt"`
}

type DocumentRevision struct {
	ID         string    `json:"id"`
	DocumentID string    `json:"documentId"`
	Title      string    `json:"title"`
	Content    string    `json:"content"`
	Category   string    `json:"category"`
	Version    int       `json:"version"`
	Message    *string   `json:"message"`
	UserID     string    `json:"userId"`
	CreatedAt  time.Time `json:"createdAt"`
}

type DocumentTemplate struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	Description *string    `json:"description"`
	Category    string     `json:"category"`
	Content     string     `json:"content"`
	Icon        string     `json:"icon"`
	IsPublic    bool       `json:"isPublic"`
	UserID      string     `json:"userId"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
}

type Folder struct {
	ID             string     `json:"id"`
	Name           string     `json:"name"`
	Color          string     `json:"color"`
	Icon           string     `json:"icon"`
	ParentID       *string    `json:"parentId"`
	UserID         string     `json:"userId"`
	OrganizationID *string    `json:"organizationId"`
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`
}

type SslCertificate struct {
	ID             string     `json:"id"`
	Hostname       string     `json:"hostname"`
	Issuer         *string    `json:"issuer"`
	Subject        *string    `json:"subject"`
	SerialNumber   *string    `json:"serialNumber"`
	ValidFrom      *time.Time `json:"validFrom"`
	ValidTo        *time.Time `json:"validTo"`
	SignatureAlgo  *string    `json:"signatureAlgo"`
	KeySize        *int       `json:"keySize"`
	SAN            *string    `json:"san"`
	IsExpired      bool       `json:"isExpired"`
	IsSelfSigned   bool       `json:"isSelfSigned"`
	CertPem        *string    `json:"-"`
	ChainPem       *string    `json:"-"`
	PrivateKey     *string    `json:"-"`
	Notes          *string    `json:"notes"`
	UserID         string     `json:"userId"`
	OrganizationID *string    `json:"organizationId"`
	Tags           []Tag      `json:"tags,omitempty"`
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`
}

type NetworkDocument struct {
	ID             string     `json:"id"`
	Name           string     `json:"name"`
	Type           string     `json:"type"`
	Content        string     `json:"content"`
	Notes          *string    `json:"notes"`
	OrganizationID *string    `json:"organizationId"`
	UserID         string     `json:"userId"`
	Tags           []Tag      `json:"tags,omitempty"`
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`
}

type Server struct {
	ID             string     `json:"id"`
	Name           string     `json:"name"`
	Hostname       *string    `json:"hostname"`
	IPAddress      *string    `json:"ipAddress"`
	MACAddress     *string    `json:"macAddress"`
	OS             *string    `json:"os"`
	OSVersion      *string    `json:"osVersion"`
	CPU            *string    `json:"cpu"`
	CPUCores       *int       `json:"cpuCores"`
	RAMGB          *float64   `json:"ramGB"`
	StorageGB      *float64   `json:"storageGB"`
	StorageType    *string    `json:"storageType"`
	Status         string     `json:"status"`
	Location       *string    `json:"location"`
	RackPosition   *string    `json:"rackPosition"`
	SerialNumber   *string    `json:"serialNumber"`
	AssetTag       *string    `json:"assetTag"`
	PurchaseDate   *time.Time `json:"purchaseDate"`
	WarrantyExpiry *time.Time `json:"warrantyExpiry"`
	Notes          *string    `json:"notes"`
	OrganizationID *string    `json:"organizationId"`
	UserID         string     `json:"userId"`
	Tags           []Tag      `json:"tags,omitempty"`
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`
}

type MaintenanceWindow struct {
	ID             string     `json:"id"`
	Name           string     `json:"name"`
	Description    *string    `json:"description"`
	StartTime      time.Time  `json:"startTime"`
	EndTime        time.Time  `json:"endTime"`
	Recurrence     *string    `json:"recurrence"`
	Status         string     `json:"status"`
	Priority       string     `json:"priority"`
	Impact         *string    `json:"impact"`
	AffectedSystems *string   `json:"affectedSystems"`
	NotifyEmails   *string    `json:"notifyEmails"`
	OrganizationID *string    `json:"organizationId"`
	UserID         string     `json:"userId"`
	Tags           []Tag      `json:"tags,omitempty"`
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`
}

type CloudResource struct {
	ID             string     `json:"id"`
	Name           string     `json:"name"`
	Provider       string     `json:"provider"`
	Service        string     `json:"service"`
	ResourceID     *string    `json:"resourceId"`
	Region         *string    `json:"region"`
	Status         string     `json:"status"`
	Cost           *float64   `json:"cost"`
	CostCurrency   *string    `json:"costCurrency"`
	CloudTags      *string    `json:"cloudTags"`
	Metadata       *string    `json:"metadata"`
	Notes          *string    `json:"notes"`
	OrganizationID *string    `json:"organizationId"`
	UserID         string     `json:"userId"`
	Tags           []Tag      `json:"tags,omitempty"`
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`
}

type StatusPage struct {
	ID             string           `json:"id"`
	Name           string           `json:"name"`
	Slug           string           `json:"slug"`
	Description    *string          `json:"description"`
	IsPublic       bool             `json:"isPublic"`
	OrganizationID *string          `json:"organizationId"`
	UserID         string           `json:"userId"`
	Components     []StatusComponent `json:"components,omitempty"`
	Incidents      []StatusIncident  `json:"incidents,omitempty"`
	CreatedAt      time.Time        `json:"createdAt"`
	UpdatedAt      time.Time        `json:"updatedAt"`
}

type StatusComponent struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Status       string    `json:"status"`
	Order        int       `json:"position"`
	StatusPageID string    `json:"statusPageId"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type StatusIncident struct {
	ID           string           `json:"id"`
	Title        string           `json:"title"`
	Description  *string          `json:"description"`
	Status       string           `json:"status"`
	Impact       string           `json:"impact"`
	StatusPageID string           `json:"statusPageId"`
	Updates      []IncidentUpdate `json:"updates,omitempty"`
	CreatedAt    time.Time        `json:"createdAt"`
	UpdatedAt    time.Time        `json:"updatedAt"`
}

type IncidentUpdate struct {
	ID          string    `json:"id"`
	Message     string    `json:"message"`
	Status      string    `json:"status"`
	IncidentID  string    `json:"incidentId"`
	CreatedAt   time.Time `json:"createdAt"`
}

type ScheduledScan struct {
	ID             string     `json:"id"`
	Name           string     `json:"name"`
	Type           string     `json:"type"`
	Config         string     `json:"config"`
	CronExpression string     `json:"cronExpression"`
	IsActive       bool       `json:"isActive"`
	LastRunAt      *time.Time `json:"lastRunAt"`
	LastResult     *string    `json:"lastResult"`
	NextRunAt      *time.Time `json:"nextRunAt"`
	OrganizationID *string    `json:"organizationId"`
	UserID         string     `json:"userId"`
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`
}

type ScanRun struct {
	ID          string     `json:"id"`
	ScanID      string     `json:"scanId"`
	Status      string     `json:"status"`
	StartedAt   time.Time  `json:"startedAt"`
	CompletedAt *time.Time `json:"completedAt"`
	Result      *string    `json:"result"`
	Error       *string    `json:"error"`
	Duration    *int       `json:"duration"`
}

type InfraChange struct {
	ID             string     `json:"id"`
	ResourceType   string     `json:"resourceType"`
	ResourceID     string     `json:"resourceId"`
	ChangeType     string     `json:"changeType"`
	Field          *string    `json:"field"`
	OldValue       *string    `json:"oldValue"`
	NewValue       *string    `json:"newValue"`
	Summary        string     `json:"summary"`
	DetectedAt     time.Time  `json:"detectedAt"`
	Acknowledged   bool       `json:"acknowledged"`
	AcknowledgedAt *time.Time `json:"acknowledgedAt"`
	OrganizationID *string    `json:"organizationId"`
	UserID         *string    `json:"userId"`
}

type CostEntry struct {
	ID             string     `json:"id"`
	Provider       string     `json:"provider"`
	Service        string     `json:"service"`
	Region         *string    `json:"region"`
	Amount         float64    `json:"amount"`
	Currency       string     `json:"currency"`
	Period         string     `json:"period"`
	PeriodType     string     `json:"periodType"`
	Metadata       *string    `json:"metadata"`
	OrganizationID *string    `json:"organizationId"`
	UserID         string     `json:"userId"`
	FetchedAt      time.Time  `json:"fetchedAt"`
}

type CostBudget struct {
	ID             string     `json:"id"`
	Name           string     `json:"name"`
	Provider       *string    `json:"provider"`
	Service        *string    `json:"service"`
	MonthlyLimit   float64    `json:"monthlyLimit"`
	AlertThreshold float64    `json:"alertThreshold"`
	IsEnabled      bool       `json:"isEnabled"`
	LastAlertAt    *time.Time `json:"lastAlertAt"`
	OrganizationID *string    `json:"organizationId"`
	UserID         string     `json:"userId"`
	CreatedAt      time.Time  `json:"createdAt"`
}

type DockerHost struct {
	ID             string           `json:"id"`
	Name           string           `json:"name"`
	Endpoint       string           `json:"endpoint"`
	Type           string           `json:"type"`
	Status         string           `json:"status"`
	Version        *string          `json:"version"`
	Containers     int              `json:"containers"`
	Images         int              `json:"images"`
	Networks       int              `json:"networks"`
	Volumes        int              `json:"volumes"`
	Metadata       *string          `json:"metadata"`
	LastScanAt     *time.Time       `json:"lastScanAt"`
	OrganizationID *string          `json:"organizationId"`
	UserID         string           `json:"userId"`
	ContainersList []DockerContainer `json:"containersList,omitempty"`
	CreatedAt      time.Time        `json:"createdAt"`
	UpdatedAt      time.Time        `json:"updatedAt"`
}

type DockerContainer struct {
	ID          string    `json:"id"`
	HostID      string    `json:"hostId"`
	ContainerID string    `json:"containerId"`
	Name        string    `json:"name"`
	Image       string    `json:"image"`
	Status      string    `json:"status"`
	State       string    `json:"state"`
	Ports       *string   `json:"ports"`
	Env         *string   `json:"-"`
	Mounts      *string   `json:"mounts"`
	NetworkMode *string   `json:"networkMode"`
	IP          *string   `json:"ip"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type K8sCluster struct {
	ID             string     `json:"id"`
	Name           string     `json:"name"`
	Kubeconfig     *string    `json:"-"`
	ServerURL      string     `json:"serverUrl"`
	Version        *string    `json:"version"`
	Namespaces     int        `json:"namespaces"`
	Pods           int        `json:"pods"`
	Services       int        `json:"services"`
	Deployments    int        `json:"deployments"`
	Nodes          int        `json:"nodes"`
	Status         string     `json:"status"`
	Metadata       *string    `json:"metadata"`
	LastScanAt     *time.Time `json:"lastScanAt"`
	OrganizationID *string    `json:"organizationId"`
	UserID         string     `json:"userId"`
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`
}

// Pagination response
type PaginatedResponse[T any] struct {
	Items  []T `json:"items"`
	Total  int `json:"total"`
	Page   int `json:"page"`
	Limit  int `json:"limit"`
	HasMore bool `json:"hasMore"`
}
