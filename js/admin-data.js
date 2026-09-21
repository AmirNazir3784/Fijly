/* Fictional fixtures used to initialize the shared frontend session mock. */
window.FijlyAdminData = {
  snapshot: '2026-09-20',
  clients: [
    { id: 'northbeam', name: 'Northbeam', contact: 'Alex Rivera', email: 'alex@northbeam.example', industry: 'SaaS portfolio', status: 'Active', notes: 'Product launch and onboarding videos across the Northbeam product portfolio.' },
    { id: 'layerbase', name: 'Layerbase', contact: 'Priya Shah', email: 'priya@layerbase.example', industry: 'Developer tools', status: 'Active', notes: 'Keep technical explanations clear. Product team reviews scripts before animation.' },
    { id: 'orbitly', name: 'Orbitly', contact: 'Jordan Lee', email: 'jordan@orbitly.example', industry: 'Customer success', status: 'Active', notes: 'Monthly product releases. Deliver square and widescreen versions.' },
    { id: 'clearpath', name: 'Clearpath', contact: 'Morgan Ellis', email: 'morgan@clearpath.example', industry: 'Analytics', status: 'Active', notes: 'Focus on the reporting workflow and time saved for operations leads.' },
    { id: 'relay', name: 'Relay', contact: 'Taylor Brooks', email: 'taylor@relay.example', industry: 'Collaboration', status: 'Onboarding', notes: 'Awaiting brand guidelines and a product walkthrough recording.' },
    { id: 'linearwave', name: 'Linearwave', contact: 'Casey Kim', email: 'casey@linearwave.example', industry: 'Workflow automation', status: 'Paused', notes: 'Next production cycle starts after the product refresh.' }
  ],
  projects: [
    { client: 'northbeam', title: 'AIFlow / Product launch', format: 'SaaS Launch', status: 'In production', due: '2026-09-23' },
    { client: 'northbeam', title: 'CloudDesk / Homepage explainer', format: 'Homepage Video', status: 'In review', due: '2026-09-22' },
    { client: 'northbeam', title: 'TaskPilot / Product demo', format: 'Product Demo', status: 'Script approved', due: '2026-09-30' },
    { client: 'northbeam', title: 'Finly / Tutorial series', format: 'Tutorial', status: 'Delivered', due: '2026-09-17', completedAt: '2026-09-19T15:00:00Z' },
    { client: 'layerbase', title: 'API workspace launch', format: 'SaaS Launch', status: 'In production', due: '2026-09-24' },
    { client: 'layerbase', title: 'Getting started', format: 'Tutorial', status: 'In review', due: '2026-09-25' },
    { client: 'orbitly', title: 'Customer health overview', format: 'Product Demo', status: 'In production', due: '2026-09-28' },
    { client: 'orbitly', title: 'Release highlights', format: 'Product Promo', status: 'Delivered', due: '2026-09-18', completedAt: '2026-09-20T11:00:00Z' },
    { client: 'clearpath', title: 'Reporting, explained', format: 'Explainer', status: 'In review', due: '2026-09-29' },
    { client: 'clearpath', title: 'Homepage story', format: 'Homepage Video', status: 'Script approved', due: '2026-10-02' },
    { client: 'linearwave', title: 'Workflow introduction', format: 'Explainer', status: 'Delivered', due: '2026-09-10', completedAt: '2026-09-20T16:30:00Z' }
  ],
  /* Simulated asset records. Only metadata is held; no file is ever uploaded,
     read or stored. `size` is a plausible byte count for display. */
  assets: [
    { id: 'asset-1',  client: 'northbeam', name: 'northbeam-logo-primary.svg',     category: 'Logo',             fileType: 'svg',  size: 18400,    uploadedAt: '2026-08-04T09:15:00Z', notes: 'Primary mark. Use on light backgrounds.', simulated: true },
    { id: 'asset-2',  client: 'northbeam', name: 'northbeam-logo-reverse.svg',     category: 'Logo',             fileType: 'svg',  size: 17900,    uploadedAt: '2026-08-04T09:16:00Z', notes: 'Reverse mark for dark scenes.', simulated: true },
    { id: 'asset-3',  client: 'northbeam', name: 'northbeam-brand-guidelines.pdf', category: 'Brand Guidelines', fileType: 'pdf',  size: 4820000,  uploadedAt: '2026-08-04T09:20:00Z', notes: 'Colour, spacing and tone of voice.', simulated: true },
    { id: 'asset-4',  client: 'northbeam', name: 'inter-variable.woff2',           category: 'Fonts',            fileType: 'woff2', size: 268000,  uploadedAt: '2026-08-05T11:02:00Z', notes: '', simulated: true },
    { id: 'asset-5',  client: 'northbeam', name: 'dashboard-walkthrough.mov',      category: 'B-roll',           fileType: 'mov',  size: 412000000, uploadedAt: '2026-09-02T14:40:00Z', notes: 'Screen capture of the reporting flow.', simulated: true },
    { id: 'asset-6',  client: 'northbeam', name: 'product-ui-set.zip',             category: 'Product Images',   fileType: 'zip',  size: 22400000, uploadedAt: '2026-09-02T14:45:00Z', notes: 'Exported at 2x.', simulated: true },
    { id: 'asset-7',  client: 'layerbase', name: 'layerbase-logo-lockup.svg',      category: 'Logo',             fileType: 'svg',  size: 21200,    uploadedAt: '2026-08-11T10:05:00Z', notes: '', simulated: true },
    { id: 'asset-8',  client: 'layerbase', name: 'layerbase-guidelines.pdf',       category: 'Brand Guidelines', fileType: 'pdf',  size: 3100000,  uploadedAt: '2026-08-11T10:07:00Z', notes: 'Technical terminology reference.', simulated: true },
    { id: 'asset-9',  client: 'layerbase', name: 'engineering-team-headshots.zip', category: 'Headshots',        fileType: 'zip',  size: 48200000, uploadedAt: '2026-08-19T16:30:00Z', notes: 'Six contributors, neutral background.', simulated: true },
    { id: 'asset-10', client: 'orbitly',   name: 'orbitly-logo-primary.png',       category: 'Logo',             fileType: 'png',  size: 96000,    uploadedAt: '2026-07-28T08:50:00Z', notes: '', simulated: true },
    { id: 'asset-11', client: 'orbitly',   name: 'release-highlights-broll.mp4',   category: 'B-roll',           fileType: 'mp4',  size: 256000000, uploadedAt: '2026-09-10T13:12:00Z', notes: 'Raw capture, unedited.', simulated: true },
    { id: 'asset-12', client: 'orbitly',   name: 'competitor-reference-deck.pdf',  category: 'Reference Files',  fileType: 'pdf',  size: 1840000,  uploadedAt: '2026-09-10T13:20:00Z', notes: 'Tone reference supplied by the client.', simulated: true },
    { id: 'asset-13', client: 'clearpath', name: 'clearpath-logo.svg',             category: 'Logo',             fileType: 'svg',  size: 15600,    uploadedAt: '2026-08-22T09:00:00Z', notes: '', simulated: true },
    { id: 'asset-14', client: 'clearpath', name: 'reporting-screens.zip',          category: 'Product Images',   fileType: 'zip',  size: 18900000, uploadedAt: '2026-09-05T15:25:00Z', notes: 'Reporting workflow, light theme.', simulated: true },
    { id: 'asset-15', client: 'relay',     name: 'relay-logo-draft.png',           category: 'Logo',             fileType: 'png',  size: 88000,    uploadedAt: '2026-09-18T12:00:00Z', notes: 'Draft mark; confirm before animation.', simulated: true },
    { id: 'asset-16', client: 'relay',     name: 'voice-and-tone.docx',            category: 'Reference Files',  fileType: 'docx', size: 74000,    uploadedAt: '2026-09-18T12:04:00Z', notes: '', simulated: true },
    { id: 'asset-17', client: 'linearwave', name: 'linearwave-brand-kit.zip',         category: 'Other',            fileType: 'zip',  size: 12600000, uploadedAt: '2026-09-12T10:30:00Z', notes: 'Mixed assets, needs sorting into categories.', simulated: true }
  ],
  /* Admin Portal preferences. Session-scoped mock values only. */
  settings: {
    adminName: 'Sam Ortiz',
    adminRole: 'Studio producer',
    adminEmail: 'sam@fijly.example',
    studioName: 'FIJLY Studio',
    studioEmail: 'hello@fijly.example',
    studioLocation: 'Remote / GMT+1',
    notifyNewRequest: true,
    notifyRevision: true,
    notifyApproval: false,
    notifyWeeklyDigest: true,
    defaultPriority: 'Normal',
    defaultLeadDays: 10,
    defaultLength: '60–90 sec'
  }
};
