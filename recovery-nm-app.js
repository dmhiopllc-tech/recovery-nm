// ====================================================================
// RECOVERY NM SCHOLARSHIP MANAGEMENT SYSTEM
// JavaScript Application Logic - HIPAA Compliant
// ====================================================================

// Supabase Configuration
const SUPABASE_URL = 'YOUR_SUPABASE_URL_HERE';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY_HERE';

let supabase;
let currentUser = null;

// ====================================================================
// INITIALIZATION
// ====================================================================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Initialize Supabase client
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        
        // Check authentication
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
            // Redirect to login page (create separately)
            window.location.href = 'recovery-nm-login.html';
            return;
        }
        
        // Get current user details
        await loadCurrentUser();
        
        // Initialize dashboard
        await initializeDashboard();
        
        // Start session timer (30 minutes)
        startSessionTimer();
        
        // Log audit event
        await logAudit('LOGIN', 'user', currentUser.id, {action: 'Dashboard accessed'});
        
    } catch (error) {
        console.error('Initialization error:', error);
        alert('Failed to initialize application. Please refresh the page.');
    }
});

// ====================================================================
// AUTHENTICATION & USER MANAGEMENT
// ====================================================================
async function loadCurrentUser() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) throw new Error('No user found');
        
        // Get user profile from users table
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', user.email)
            .single();
        
        if (error) throw error;
        
        currentUser = data;
        
        // Update UI
        document.getElementById('currentUserName').textContent = currentUser.full_name;
        document.getElementById('userRole').textContent = 
            currentUser.role === 'super_admin' ? 'SUPER ADMIN' : 'ADMIN';
        
        // Show Users tab only for super admins
        if (currentUser.role === 'super_admin') {
            document.getElementById('usersTabBtn').classList.remove('hidden');
        }
        
        // Update last login
        await supabase
            .from('users')
            .update({ last_login: new Date().toISOString() })
            .eq('id', currentUser.id);
        
    } catch (error) {
        console.error('Error loading user:', error);
        await logout();
    }
}

async function logout() {
    try {
        if (currentUser) {
            await logAudit('LOGOUT', 'user', currentUser.id, {action: 'User logged out'});
        }
        
        await supabase.auth.signOut();
        window.location.href = 'recovery-nm-login.html';
    } catch (error) {
        console.error('Logout error:', error);
        window.location.href = 'recovery-nm-login.html';
    }
}

// ====================================================================
// SESSION TIMER (30 minutes)
// ====================================================================
let sessionTimeRemaining = 30 * 60; // 30 minutes in seconds

function startSessionTimer() {
    const timerElement = document.getElementById('sessionTimer');
    const displayElement = document.getElementById('timerDisplay');
    
    timerElement.classList.remove('hidden');
    
    const interval = setInterval(() => {
        sessionTimeRemaining--;
        
        const minutes = Math.floor(sessionTimeRemaining / 60);
        const seconds = sessionTimeRemaining % 60;
        
        displayElement.textContent = 
            `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        // Warning at 5 minutes
        if (sessionTimeRemaining === 5 * 60) {
            if (confirm('Your session will expire in 5 minutes. Continue working?')) {
                sessionTimeRemaining = 30 * 60;
                displayElement.textContent = '30:00';
            }
        }
        
        // Session expired
        if (sessionTimeRemaining <= 0) {
            clearInterval(interval);
            alert('Your session has expired for security reasons. Please log in again.');
            logout();
        }
    }, 1000);
    
    // Reset timer on user activity
    ['click', 'keypress', 'scroll', 'mousemove'].forEach(event => {
        document.addEventListener(event, () => {
            if (sessionTimeRemaining < 25 * 60) {
                sessionTimeRemaining = 30 * 60;
            }
        });
    });
}

// ====================================================================
// TAB NAVIGATION
// ====================================================================
function showTab(tabName) {
    // Hide all tab content
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.add('hidden');
    });
    
    // Remove active class from all buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('tab-active');
    });
    
    // Show selected tab
    document.getElementById(`${tabName}Tab`).classList.remove('hidden');
    
    // Add active class to clicked button
    event.target.closest('button').classList.add('tab-active');
    
    // Load tab data
    loadTabData(tabName);
}

async function loadTabData(tabName) {
    switch(tabName) {
        case 'dashboard':
            await loadDashboard();
            break;
        case 'clients':
            await loadClients();
            break;
        case 'scholarships':
            await loadScholarships();
            break;
        case 'donations':
            await loadDonations();
            break;
        case 'reports':
            // Reports are generated on demand
            break;
        case 'users':
            if (currentUser.role === 'super_admin') {
                await loadUsers();
            }
            break;
    }
}

// ====================================================================
// DASHBOARD
// ====================================================================
async function initializeDashboard() {
    await loadDashboard();
}

async function loadDashboard() {
    try {
        // Load financial summary
        const { data: summary, error: summaryError } = await supabase
            .from('financial_summary')
            .select('*')
            .single();
        
        if (summaryError) throw summaryError;
        
        // Update financial cards
        document.getElementById('totalDonations').textContent = 
            formatCurrency(summary.total_donations);
        document.getElementById('totalDisbursed').textContent = 
            formatCurrency(summary.total_disbursed);
        document.getElementById('availableBalance').textContent = 
            formatCurrency(summary.available_balance);
        document.getElementById('pendingCommitments').textContent = 
            formatCurrency(summary.pending_commitments);
        
        // Load pending approvals
        await loadPendingApprovals();
        
        // Load recent activity
        await loadRecentActivity();
        
    } catch (error) {
        console.error('Dashboard load error:', error);
        showError('Failed to load dashboard data');
    }
}

async function loadPendingApprovals() {
    try {
        const { data, error } = await supabase
            .from('pending_scholarships')
            .select('*')
            .order('created_at', { ascending: true });
        
        if (error) throw error;
        
        const container = document.getElementById('pendingApprovalsList');
        const countBadge = document.getElementById('pendingCount');
        
        if (!data || data.length === 0) {
            container.innerHTML = 
                '<p class="text-gray-500 text-center py-8">No pending scholarships require approval</p>';
            countBadge.textContent = '0';
            countBadge.classList.remove('badge-pending');
            countBadge.classList.add('bg-gray-300');
            return;
        }
        
        countBadge.textContent = data.length;
        
        let html = '<div class="space-y-4">';
        
        data.forEach(scholarship => {
            const clientIds = [
                scholarship.client_id_1,
                scholarship.client_id_2,
                scholarship.client_id_3
            ].filter(id => id).join('-');
            
            html += `
                <div class="border border-burgundy rounded-lg p-4 hover:bg-gray-50">
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            <h4 class="font-bold text-burgundy">${scholarship.scholarship_id}</h4>
                            <p class="text-sm text-gray-600">Client IDs: ${clientIds}</p>
                            <p class="text-sm text-gray-600">Center: ${scholarship.center_name}</p>
                        </div>
                        <div class="text-right">
                            <p class="text-2xl font-bold text-burgundy">${formatCurrency(scholarship.amount)}</p>
                            <span class="approval-badge approval-badge-${scholarship.approval_count}">
                                <i class="fas fa-check-circle"></i>
                                ${scholarship.approval_count}/2 Approved
                            </span>
                        </div>
                    </div>
                    ${scholarship.approved_by && scholarship.approved_by.length > 0 ? `
                        <p class="text-xs text-gray-500 mb-2">
                            Approved by: ${scholarship.approved_by.join(', ')}
                        </p>
                    ` : ''}
                    <div class="flex gap-2">
                        ${scholarship.approval_count < 2 ? `
                            <button onclick="approveScholarship('${scholarship.id}')" 
                                    class="btn-primary flex-1">
                                <i class="fas fa-thumbs-up mr-2"></i>Approve
                            </button>
                        ` : ''}
                        <button onclick="viewScholarshipDetails('${scholarship.id}')" 
                                class="btn-secondary flex-1">
                            <i class="fas fa-eye mr-2"></i>View Details
                        </button>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading pending approvals:', error);
    }
}

async function loadRecentActivity() {
    try {
        const { data, error } = await supabase
            .from('audit_log')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(10);
        
        if (error) throw error;
        
        const container = document.getElementById('recentActivityList');
        
        if (!data || data.length === 0) {
            container.innerHTML = 
                '<p class="text-gray-500 text-center py-8">No recent activity</p>';
            return;
        }
        
        let html = '<div class="space-y-2">';
        
        data.forEach(log => {
            const time = new Date(log.timestamp).toLocaleString();
            const icon = getActivityIcon(log.action);
            
            html += `
                <div class="flex items-start gap-3 p-2 hover:bg-gray-50 rounded">
                    <i class="${icon} text-burgundy"></i>
                    <div class="flex-1">
                        <p class="text-sm font-semibold">${log.action}</p>
                        <p class="text-xs text-gray-500">${time}</p>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading recent activity:', error);
    }
}

function getActivityIcon(action) {
    const icons = {
        'CREATE': 'fas fa-plus-circle',
        'UPDATE': 'fas fa-edit',
        'DELETE': 'fas fa-trash',
        'VIEW': 'fas fa-eye',
        'LOGIN': 'fas fa-sign-in-alt',
        'LOGOUT': 'fas fa-sign-out-alt',
        'APPROVE': 'fas fa-check-circle',
        'DISBURSE': 'fas fa-money-bill-wave'
    };
    return icons[action] || 'fas fa-circle';
}

// ====================================================================
// CLIENTS MANAGEMENT
// ====================================================================
async function loadClients() {
    try {
        const { data, error } = await supabase
            .from('clients')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        const container = document.getElementById('clientsTableContainer');
        
        if (!data || data.length === 0) {
            container.innerHTML = 
                '<p class="text-gray-500 text-center py-8">No clients found. Add your first client!</p>';
            return;
        }
        
        let html = `
            <table>
                <thead>
                    <tr>
                        <th>Client ID 1</th>
                        <th>Client ID 2</th>
                        <th>Client ID 3</th>
                        <th>Scholarships</th>
                        <th>Created</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        for (const client of data) {
            // Count scholarships for this client
            const { count } = await supabase
                .from('scholarships')
                .select('*', { count: 'exact', head: true })
                .eq('client_id', client.id);
            
            html += `
                <tr>
                    <td><strong>${client.client_id_1}</strong></td>
                    <td>${client.client_id_2 || '-'}</td>
                    <td>${client.client_id_3 || '-'}</td>
                    <td>${count || 0} scholarship(s)</td>
                    <td>${new Date(client.created_at).toLocaleDateString()}</td>
                    <td>
                        <button onclick="viewClientDetails('${client.id}')" 
                                class="btn-secondary text-sm px-3 py-1">
                            <i class="fas fa-eye mr-1"></i>View
                        </button>
                    </td>
                </tr>
            `;
        }
        
        html += '</tbody></table>';
        container.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading clients:', error);
        showError('Failed to load clients');
    }
}

function showAddClientModal() {
    const modal = createModal('Add New Client', `
        <form id="addClientForm" class="space-y-4">
            <div>
                <label class="form-label">Client ID 1 (Required)</label>
                <input type="text" id="clientId1" required class="form-input" 
                       placeholder="e.g., ABC123">
            </div>
            <div>
                <label class="form-label">Client ID 2 (Optional)</label>
                <input type="text" id="clientId2" class="form-input">
            </div>
            <div>
                <label class="form-label">Client ID 3 (Optional)</label>
                <input type="text" id="clientId3" class="form-input">
            </div>
            <div>
                <label class="form-label">Notes (Optional)</label>
                <textarea id="clientNotes" class="form-input" rows="3"></textarea>
            </div>
            <div class="flex gap-2">
                <button type="submit" class="btn-primary flex-1">
                    <i class="fas fa-save mr-2"></i>Add Client
                </button>
                <button type="button" onclick="closeModal()" class="btn-secondary flex-1">
                    Cancel
                </button>
            </div>
        </form>
    `);
    
    document.getElementById('addClientForm').addEventListener('submit', addClient);
}

async function addClient(e) {
    e.preventDefault();
    
    try {
        const clientData = {
            client_id_1: document.getElementById('clientId1').value.trim(),
            client_id_2: document.getElementById('clientId2').value.trim() || null,
            client_id_3: document.getElementById('clientId3').value.trim() || null,
            notes: document.getElementById('clientNotes').value.trim() || null,
            created_by: currentUser.id
        };
        
        const { data, error } = await supabase
            .from('clients')
            .insert([clientData])
            .select()
            .single();
        
        if (error) throw error;
        
        await logAudit('CREATE', 'client', data.id, {action: 'Client added', client: clientData});
        
        showSuccess('Client added successfully!');
        closeModal();
        await loadClients();
        
    } catch (error) {
        console.error('Error adding client:', error);
        showError('Failed to add client: ' + error.message);
    }
}

// ====================================================================
// DONATIONS MANAGEMENT
// ====================================================================
async function loadDonations() {
    try {
        const { data, error } = await supabase
            .from('donations')
            .select('*')
            .order('donation_date', { ascending: false });
        
        if (error) throw error;
        
        const container = document.getElementById('donationsTableContainer');
        
        if (!data || data.length === 0) {
            container.innerHTML = 
                '<p class="text-gray-500 text-center py-8">No donations recorded yet.</p>';
            return;
        }
        
        let html = `
            <table>
                <thead>
                    <tr>
                        <th>Donation ID</th>
                        <th>Donor Name</th>
                        <th>Amount</th>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Receipt Sent</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        data.forEach(donation => {
            html += `
                <tr>
                    <td><strong>${donation.donation_id}</strong></td>
                    <td>${donation.donor_name}</td>
                    <td class="text-green font-bold">${formatCurrency(donation.amount)}</td>
                    <td>${new Date(donation.donation_date).toLocaleDateString()}</td>
                    <td>${formatDonationType(donation.donation_type)}</td>
                    <td>
                        ${donation.receipt_sent 
                            ? '<span class="badge-approved">Yes</span>'
                            : '<span class="badge-pending">No</span>'}
                    </td>
                    <td>
                        <button onclick="viewDonationDetails('${donation.id}')" 
                                class="btn-secondary text-sm px-3 py-1">
                            <i class="fas fa-eye mr-1"></i>View
                        </button>
                    </td>
                </tr>
            `;
        });
        
        html += '</tbody></table>';
        container.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading donations:', error);
        showError('Failed to load donations');
    }
}

function showAddDonationModal() {
    const modal = createModal('Record Donation', `
        <form id="addDonationForm" class="space-y-4">
            <div>
                <label class="form-label">Donor Name *</label>
                <input type="text" id="donorName" required class="form-input">
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="form-label">Amount *</label>
                    <input type="number" id="donationAmount" required min="1" step="0.01" 
                           class="form-input" placeholder="0.00">
                </div>
                <div>
                    <label class="form-label">Date *</label>
                    <input type="date" id="donationDate" required class="form-input">
                </div>
            </div>
            <div>
                <label class="form-label">Donation Type *</label>
                <select id="donationType" required class="form-input">
                    <option value="">Select...</option>
                    <option value="cash">Cash</option>
                    <option value="check">Check</option>
                    <option value="credit_card">Credit Card</option>
                    <option value="ach">ACH/Bank Transfer</option>
                    <option value="wire">Wire Transfer</option>
                    <option value="other">Other</option>
                </select>
            </div>
            <div id="checkNumberDiv" class="hidden">
                <label class="form-label">Check Number</label>
                <input type="text" id="checkNumber" class="form-input">
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="form-label">Donor Email</label>
                    <input type="email" id="donorEmail" class="form-input">
                </div>
                <div>
                    <label class="form-label">Donor Phone</label>
                    <input type="tel" id="donorPhone" class="form-input">
                </div>
            </div>
            <div>
                <label class="form-label">Notes</label>
                <textarea id="donationNotes" class="form-input" rows="2"></textarea>
            </div>
            <div class="flex gap-2">
                <button type="submit" class="btn-primary flex-1">
                    <i class="fas fa-save mr-2"></i>Record Donation
                </button>
                <button type="button" onclick="closeModal()" class="btn-secondary flex-1">
                    Cancel
                </button>
            </div>
        </form>
    `);
    
    // Show/hide check number field
    document.getElementById('donationType').addEventListener('change', (e) => {
        const checkDiv = document.getElementById('checkNumberDiv');
        if (e.target.value === 'check') {
            checkDiv.classList.remove('hidden');
            document.getElementById('checkNumber').required = true;
        } else {
            checkDiv.classList.add('hidden');
            document.getElementById('checkNumber').required = false;
        }
    });
    
    // Set today's date as default
    document.getElementById('donationDate').valueAsDate = new Date();
    
    document.getElementById('addDonationForm').addEventListener('submit', addDonation);
}

async function addDonation(e) {
    e.preventDefault();
    
    try {
        const donationData = {
            donor_name: document.getElementById('donorName').value.trim(),
            amount: parseFloat(document.getElementById('donationAmount').value),
            donation_date: document.getElementById('donationDate').value,
            donation_type: document.getElementById('donationType').value,
            check_number: document.getElementById('checkNumber').value.trim() || null,
            donor_email: document.getElementById('donorEmail').value.trim() || null,
            donor_phone: document.getElementById('donorPhone').value.trim() || null,
            notes: document.getElementById('donationNotes').value.trim() || null,
            created_by: currentUser.id
        };
        
        const { data, error } = await supabase
            .from('donations')
            .insert([donationData])
            .select()
            .single();
        
        if (error) throw error;
        
        await logAudit('CREATE', 'donation', data.id, {
            action: 'Donation recorded',
            amount: donationData.amount,
            donor: donationData.donor_name
        });
        
        showSuccess('Donation recorded successfully!');
        closeModal();
        await loadDonations();
        await loadDashboard(); // Refresh financial summary
        
    } catch (error) {
        console.error('Error recording donation:', error);
        showError('Failed to record donation: ' + error.message);
    }
}

// ====================================================================
// SCHOLARSHIPS MANAGEMENT
// ====================================================================
async function loadScholarships() {
    try {
        const { data, error } = await supabase
            .from('scholarships')
            .select(`
                *,
                clients!inner(client_id_1, client_id_2, client_id_3),
                treatment_centers!inner(center_name)
            `)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        const container = document.getElementById('scholarshipsTableContainer');
        
        if (!data || data.length === 0) {
            container.innerHTML = 
                '<p class="text-gray-500 text-center py-8">No scholarships awarded yet.</p>';
            return;
        }
        
        let html = `
            <table>
                <thead>
                    <tr>
                        <th>Scholarship ID</th>
                        <th>Client IDs</th>
                        <th>Treatment Center</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Approvals</th>
                        <th>Award Date</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        data.forEach(scholarship => {
            const clientIds = [
                scholarship.clients.client_id_1,
                scholarship.clients.client_id_2,
                scholarship.clients.client_id_3
            ].filter(id => id).join('-');
            
            const statusBadge = getStatusBadge(scholarship.status);
            
            html += `
                <tr>
                    <td><strong>${scholarship.scholarship_id}</strong></td>
                    <td>${clientIds}</td>
                    <td>${scholarship.treatment_centers.center_name}</td>
                    <td class="font-bold text-burgundy">${formatCurrency(scholarship.amount)}</td>
                    <td>${statusBadge}</td>
                    <td>
                        <span class="approval-badge approval-badge-${scholarship.approval_count}">
                            ${scholarship.approval_count}/2
                        </span>
                    </td>
                    <td>${new Date(scholarship.award_date).toLocaleDateString()}</td>
                    <td>
                        <button onclick="viewScholarshipDetails('${scholarship.id}')" 
                                class="btn-secondary text-sm px-3 py-1">
                            <i class="fas fa-eye mr-1"></i>View
                        </button>
                    </td>
                </tr>
            `;
        });
        
        html += '</tbody></table>';
        container.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading scholarships:', error);
        showError('Failed to load scholarships');
    }
}

async function showAddScholarshipModal() {
    try {
        // Load clients and treatment centers
        const [clientsResult, centersResult] = await Promise.all([
            supabase.from('clients').select('*').eq('is_active', true),
            supabase.from('treatment_centers').select('*').eq('is_active', true)
        ]);
        
        if (clientsResult.error) throw clientsResult.error;
        if (centersResult.error) throw centersResult.error;
        
        const clients = clientsResult.data;
        const centers = centersResult.data;
        
        const modal = createModal('Award Scholarship', `
            <form id="addScholarshipForm" class="space-y-4">
                <div>
                    <label class="form-label">Select Client *</label>
                    <select id="scholarshipClient" required class="form-input">
                        <option value="">Choose a client...</option>
                        ${clients.map(c => {
                            const ids = [c.client_id_1, c.client_id_2, c.client_id_3]
                                .filter(id => id).join('-');
                            return `<option value="${c.id}">${ids}</option>`;
                        }).join('')}
                    </select>
                </div>
                <div>
                    <label class="form-label">Treatment Center *</label>
                    <select id="scholarshipCenter" required class="form-input">
                        <option value="">Choose a center...</option>
                        ${centers.map(c => 
                            `<option value="${c.id}">${c.center_name} - ${c.city}, ${c.state}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="form-label">Award Amount *</label>
                        <input type="number" id="scholarshipAmount" required min="1" step="0.01" 
                               class="form-input" placeholder="0.00">
                    </div>
                    <div>
                        <label class="form-label">Award Date *</label>
                        <input type="date" id="scholarshipDate" required class="form-input">
                    </div>
                </div>
                <div>
                    <label class="form-label">Insurance Situation *</label>
                    <select id="insuranceSituation" required class="form-input">
                        <option value="">Select...</option>
                        <option value="no_insurance">No Insurance</option>
                        <option value="high_deductible">High Deductible</option>
                        <option value="not_accepted">Insurance Not Accepted</option>
                        <option value="partial_coverage">Partial Coverage</option>
                        <option value="other">Other</option>
                    </select>
                </div>
                <div>
                    <label class="form-label">Purpose *</label>
                    <select id="scholarshipPurpose" required class="form-input">
                        <option value="">Select...</option>
                        <option value="deductible">Cover Deductible</option>
                        <option value="copay">Cover Copay</option>
                        <option value="no_insurance">No Insurance Coverage</option>
                        <option value="preferred_center">Preferred Treatment Center</option>
                        <option value="other">Other</option>
                    </select>
                </div>
                <div>
                    <label class="form-label">Notes</label>
                    <textarea id="scholarshipNotes" class="form-input" rows="3"></textarea>
                </div>
                <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4">
                    <p class="text-sm text-yellow-800">
                        <i class="fas fa-info-circle mr-2"></i>
                        This scholarship will require approval from 2 Super Admins before funds can be disbursed.
                    </p>
                </div>
                <div class="flex gap-2">
                    <button type="submit" class="btn-primary flex-1">
                        <i class="fas fa-graduation-cap mr-2"></i>Create Scholarship
                    </button>
                    <button type="button" onclick="closeModal()" class="btn-secondary flex-1">
                        Cancel
                    </button>
                </div>
            </form>
        `);
        
        // Set today's date as default
        document.getElementById('scholarshipDate').valueAsDate = new Date();
        
        document.getElementById('addScholarshipForm').addEventListener('submit', addScholarship);
        
    } catch (error) {
        console.error('Error loading form data:', error);
        showError('Failed to load form data');
    }
}

async function addScholarship(e) {
    e.preventDefault();
    
    try {
        const clientId = document.getElementById('scholarshipClient').value;
        const centerId = document.getElementById('scholarshipCenter').value;
        const amount = parseFloat(document.getElementById('scholarshipAmount').value);
        const awardDate = document.getElementById('scholarshipDate').value;
        
        // Get client IDs for scholarship ID generation
        const { data: client, error: clientError } = await supabase
            .from('clients')
            .select('*')
            .eq('id', clientId)
            .single();
        
        if (clientError) throw clientError;
        
        // Generate scholarship ID
        const scholarshipId = await generateScholarshipId(
            client.client_id_1,
            client.client_id_2,
            client.client_id_3,
            awardDate
        );
        
        const scholarshipData = {
            scholarship_id: scholarshipId,
            client_id: clientId,
            treatment_center_id: centerId,
            amount: amount,
            award_date: awardDate,
            insurance_situation: document.getElementById('insuranceSituation').value,
            purpose: document.getElementById('scholarshipPurpose').value,
            notes: document.getElementById('scholarshipNotes').value.trim() || null,
            status: 'pending',
            approval_count: 0,
            created_by: currentUser.id
        };
        
        const { data, error } = await supabase
            .from('scholarships')
            .insert([scholarshipData])
            .select()
            .single();
        
        if (error) throw error;
        
        await logAudit('CREATE', 'scholarship', data.id, {
            action: 'Scholarship created',
            scholarship_id: scholarshipId,
            amount: amount
        });
        
        showSuccess('Scholarship created successfully! It now requires 2 Super Admin approvals.');
        closeModal();
        await loadScholarships();
        await loadDashboard();
        
    } catch (error) {
        console.error('Error creating scholarship:', error);
        showError('Failed to create scholarship: ' + error.message);
    }
}

async function generateScholarshipId(id1, id2, id3, date) {
    const datePart = date.replace(/-/g, ''); // YYYYMMDD
    const ids = [id1, id2, id3].filter(id => id).join('-');
    return `${ids}-${datePart}`;
}

async function approveScholarship(scholarshipId) {
    if (!confirm('Are you sure you want to approve this scholarship? This action cannot be undone.')) {
        return;
    }
    
    try {
        // Check if user already approved this scholarship
        const { data: existingApproval, error: checkError } = await supabase
            .from('scholarship_approvals')
            .select('*')
            .eq('scholarship_id', scholarshipId)
            .eq('approver_id', currentUser.id)
            .single();
        
        if (existingApproval) {
            showError('You have already approved this scholarship.');
            return;
        }
        
        // Add approval
        const { data: approval, error: approvalError } = await supabase
            .from('scholarship_approvals')
            .insert([{
                scholarship_id: scholarshipId,
                approver_id: currentUser.id,
                approval_status: 'approved',
                comments: null
            }])
            .select()
            .single();
        
        if (approvalError) throw approvalError;
        
        // Update scholarship approval count
        const { data: scholarship, error: updateError } = await supabase
            .rpc('increment_approval_count', { scholarship_id: scholarshipId });
        
        // Check if we now have 2 approvals
        const { data: updatedScholarship, error: fetchError } = await supabase
            .from('scholarships')
            .select('approval_count')
            .eq('id', scholarshipId)
            .single();
        
        if (fetchError) throw fetchError;
        
        // If 2 approvals, change status to approved
        if (updatedScholarship.approval_count >= 2) {
            await supabase
                .from('scholarships')
                .update({ status: 'approved' })
                .eq('id', scholarshipId);
            
            showSuccess('Scholarship fully approved! Funds can now be disbursed.');
        } else {
            showSuccess('Scholarship approved! Waiting for second approval.');
        }
        
        await logAudit('APPROVE', 'scholarship', scholarshipId, {
            action: 'Scholarship approved',
            approver: currentUser.full_name
        });
        
        await loadDashboard();
        await loadScholarships();
        
    } catch (error) {
        console.error('Error approving scholarship:', error);
        showError('Failed to approve scholarship: ' + error.message);
    }
}

// ====================================================================
// REPORTS
// ====================================================================
async function generateReport(reportType) {
    try {
        let reportData;
        let fileName;
        
        switch(reportType) {
            case 'financial-summary':
                reportData = await generateFinancialSummary();
                fileName = `Financial_Summary_${Date.now()}.csv`;
                break;
            case 'donations':
                reportData = await generateDonationsReport();
                fileName = `Donations_Report_${Date.now()}.csv`;
                break;
            case 'scholarships':
                reportData = await generateScholarshipsReport();
                fileName = `Scholarships_Report_${Date.now()}.csv`;
                break;
            case 'audit-log':
                reportData = await generateAuditLog();
                fileName = `Audit_Log_${Date.now()}.csv`;
                break;
            case 'irs-990':
                reportData = await generateIRS990Data();
                fileName = `IRS_990_Data_${Date.now()}.csv`;
                break;
            case 'de-identified':
                reportData = await generateDeIdentifiedStats();
                fileName = `DeIdentified_Statistics_${Date.now()}.csv`;
                break;
            default:
                throw new Error('Unknown report type');
        }
        
        // Download CSV
        downloadCSV(reportData, fileName);
        
        await logAudit('VIEW', 'report', null, {
            action: 'Report generated',
            report_type: reportType
        });
        
        showSuccess('Report generated successfully!');
        
    } catch (error) {
        console.error('Error generating report:', error);
        showError('Failed to generate report: ' + error.message);
    }
}

async function generateFinancialSummary() {
    const { data: summary } = await supabase
        .from('financial_summary')
        .select('*')
        .single();
    
    return [
        ['Recovery NM Financial Summary'],
        ['Generated:', new Date().toLocaleString()],
        [''],
        ['Total Donations', formatCurrency(summary.total_donations)],
        ['Total Disbursed', formatCurrency(summary.total_disbursed)],
        ['Pending Commitments', formatCurrency(summary.pending_commitments)],
        ['Available Balance', formatCurrency(summary.available_balance)]
    ];
}

async function generateDonationsReport() {
    const { data: donations } = await supabase
        .from('donations')
        .select('*')
        .order('donation_date', { ascending: false });
    
    const rows = [
        ['Donation ID', 'Donor Name', 'Amount', 'Date', 'Type', 'Check Number', 'Receipt Sent']
    ];
    
    donations.forEach(d => {
        rows.push([
            d.donation_id,
            d.donor_name,
            d.amount,
            d.donation_date,
            d.donation_type,
            d.check_number || '',
            d.receipt_sent ? 'Yes' : 'No'
        ]);
    });
    
    return rows;
}

async function generateScholarshipsReport() {
    const { data: scholarships } = await supabase
        .from('scholarships')
        .select(`
            *,
            clients(client_id_1, client_id_2, client_id_3),
            treatment_centers(center_name, city, state)
        `)
        .order('award_date', { ascending: false });
    
    const rows = [
        ['Scholarship ID', 'Treatment Center', 'City', 'State', 'Amount', 
         'Award Date', 'Status', 'Approvals', 'Insurance Situation']
    ];
    
    scholarships.forEach(s => {
        rows.push([
            s.scholarship_id,
            s.treatment_centers.center_name,
            s.treatment_centers.city,
            s.treatment_centers.state,
            s.amount,
            s.award_date,
            s.status,
            `${s.approval_count}/2`,
            s.insurance_situation
        ]);
    });
    
    return rows;
}

async function generateAuditLog() {
    const { data: logs } = await supabase
        .from('audit_log')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(1000);
    
    const rows = [
        ['Timestamp', 'Action', 'Resource Type', 'User ID', 'IP Address']
    ];
    
    logs.forEach(log => {
        rows.push([
            new Date(log.timestamp).toLocaleString(),
            log.action,
            log.resource_type,
            log.user_id || 'System',
            log.ip_address || 'N/A'
        ]);
    });
    
    return rows;
}

async function generateIRS990Data() {
    // Placeholder for IRS 990 reporting data
    const rows = [
        ['IRS Form 990 Data - Recovery NM'],
        ['Tax Year', new Date().getFullYear()],
        ['Generated', new Date().toLocaleString()],
        [''],
        ['Total Contributions', ''],
        ['Total Program Expenses', ''],
        ['Management Expenses', ''],
        ['Fundraising Expenses', '']
    ];
    
    return rows;
}

async function generateDeIdentifiedStats() {
    const { data: scholarships } = await supabase
        .from('scholarships')
        .select('amount, insurance_situation, status, award_date');
    
    const totalAmount = scholarships.reduce((sum, s) => sum + parseFloat(s.amount), 0);
    const avgAmount = totalAmount / scholarships.length;
    
    const byInsurance = scholarships.reduce((acc, s) => {
        acc[s.insurance_situation] = (acc[s.insurance_situation] || 0) + 1;
        return acc;
    }, {});
    
    const rows = [
        ['De-Identified Statistics - Recovery NM'],
        ['Generated', new Date().toLocaleString()],
        [''],
        ['Total Scholarships', scholarships.length],
        ['Total Amount Awarded', formatCurrency(totalAmount)],
        ['Average Scholarship Amount', formatCurrency(avgAmount)],
        [''],
        ['By Insurance Situation:'],
        ...Object.entries(byInsurance).map(([situation, count]) => 
            [situation, count]
        )
    ];
    
    return rows;
}

function downloadCSV(data, fileName) {
    const csv = data.map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ====================================================================
// USER MANAGEMENT (SUPER ADMIN ONLY)
// ====================================================================
async function loadUsers() {
    if (currentUser.role !== 'super_admin') {
        showError('Access denied. Super Admin only.');
        return;
    }
    
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        const container = document.getElementById('usersTableContainer');
        
        let html = `
            <table>
                <thead>
                    <tr>
                        <th>Full Name</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Last Login</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        data.forEach(user => {
            html += `
                <tr>
                    <td><strong>${user.full_name}</strong></td>
                    <td>${user.email}</td>
                    <td>
                        <span class="px-2 py-1 rounded-full text-xs font-bold ${
                            user.role === 'super_admin' 
                                ? 'bg-red-100 text-red-800' 
                                : 'bg-blue-100 text-blue-800'
                        }">
                            ${user.role === 'super_admin' ? 'SUPER ADMIN' : 'ADMIN'}
                        </span>
                    </td>
                    <td>
                        ${user.is_active 
                            ? '<span class="badge-approved">Active</span>'
                            : '<span class="badge-cancelled">Inactive</span>'}
                    </td>
                    <td>${user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}</td>
                    <td>
                        <button onclick="editUser('${user.id}')" 
                                class="btn-secondary text-sm px-3 py-1">
                            <i class="fas fa-edit mr-1"></i>Edit
                        </button>
                    </td>
                </tr>
            `;
        });
        
        html += '</tbody></table>';
        container.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading users:', error);
        showError('Failed to load users');
    }
}

function showAddUserModal() {
    if (currentUser.role !== 'super_admin') {
        showError('Access denied. Super Admin only.');
        return;
    }
    
    const modal = createModal('Add New User', `
        <form id="addUserForm" class="space-y-4">
            <div>
                <label class="form-label">Full Name *</label>
                <input type="text" id="userName" required class="form-input">
            </div>
            <div>
                <label class="form-label">Email Address *</label>
                <input type="email" id="userEmail" required class="form-input">
            </div>
            <div>
                <label class="form-label">Role *</label>
                <select id="userRole" required class="form-input">
                    <option value="admin">Admin</option>
                    <option value="super_admin">Super Admin</option>
                </select>
            </div>
            <div class="bg-blue-50 border-l-4 border-blue-400 p-4">
                <p class="text-sm text-blue-800">
                    <i class="fas fa-info-circle mr-2"></i>
                    The user will receive an email with login instructions.
                </p>
            </div>
            <div class="flex gap-2">
                <button type="submit" class="btn-primary flex-1">
                    <i class="fas fa-user-plus mr-2"></i>Add User
                </button>
                <button type="button" onclick="closeModal()" class="btn-secondary flex-1">
                    Cancel
                </button>
            </div>
        </form>
    `);
    
    document.getElementById('addUserForm').addEventListener('submit', addUser);
}

async function addUser(e) {
    e.preventDefault();
    
    try {
        const userData = {
            full_name: document.getElementById('userName').value.trim(),
            email: document.getElementById('userEmail').value.trim().toLowerCase(),
            role: document.getElementById('userRole').value,
            is_active: true,
            created_by: currentUser.id
        };
        
        const { data, error } = await supabase
            .from('users')
            .insert([userData])
            .select()
            .single();
        
        if (error) throw error;
        
        await logAudit('CREATE', 'user', data.id, {
            action: 'User created',
            user: userData
        });
        
        showSuccess('User added successfully!');
        closeModal();
        await loadUsers();
        
    } catch (error) {
        console.error('Error adding user:', error);
        showError('Failed to add user: ' + error.message);
    }
}

async function editUser(userId) {
    // Implement user editing functionality
    showError('User editing feature coming soon');
}

// ====================================================================
// UTILITY FUNCTIONS
// ====================================================================
async function logAudit(action, resourceType, resourceId, details) {
    try {
        await supabase
            .from('audit_log')
            .insert([{
                user_id: currentUser?.id || null,
                action: action,
                resource_type: resourceType,
                resource_id: resourceId,
                details: details
            }]);
    } catch (error) {
        console.error('Audit log error:', error);
    }
}

function createModal(title, content) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'currentModal';
    
    modal.innerHTML = `
        <div class="modal-content">
            <div class="p-6">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-2xl font-bold text-burgundy">${title}</h2>
                    <button onclick="closeModal()" class="text-gray-500 hover:text-gray-700">
                        <i class="fas fa-times text-2xl"></i>
                    </button>
                </div>
                ${content}
            </div>
        </div>
    `;
    
    document.getElementById('modalContainer').appendChild(modal);
    return modal;
}

function closeModal() {
    const modal = document.getElementById('currentModal');
    if (modal) {
        modal.remove();
    }
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount || 0);
}

function formatDonationType(type) {
    const types = {
        'cash': 'Cash',
        'check': 'Check',
        'credit_card': 'Credit Card',
        'ach': 'ACH',
        'wire': 'Wire Transfer',
        'other': 'Other'
    };
    return types[type] || type;
}

function getStatusBadge(status) {
    const badges = {
        'pending': '<span class="badge-pending">Pending</span>',
        'approved': '<span class="badge-approved">Approved</span>',
        'disbursed': '<span class="badge-disbursed">Disbursed</span>',
        'cancelled': '<span class="badge-cancelled">Cancelled</span>'
    };
    return badges[status] || status;
}

function showSuccess(message) {
    alert('✅ ' + message);
}

function showError(message) {
    alert('❌ ' + message);
}

function viewClientDetails(clientId) {
    // Implement client details view
    showError('Details view coming soon');
}

function viewDonationDetails(donationId) {
    // Implement donation details view
    showError('Details view coming soon');
}

function viewScholarshipDetails(scholarshipId) {
    // Implement scholarship details view
    showError('Details view coming soon');
}

// ====================================================================
// KEYBOARD SHORTCUTS
// ====================================================================
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + L = Logout
    if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault();
        logout();
    }
});
