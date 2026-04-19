// 1. IMPORT FIREBASE (Perhatikan penambahan 'updateDoc' di baris kedua)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, where, doc, deleteDoc, setDoc, getDocs, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// 2. CONFIG FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyCNGQA4wsf63bp7G0bkN1VGlBFlrYHnv7g",
    authDomain: "catatcuan-c80e7.firebaseapp.com",
    projectId: "catatcuan-c80e7",
    storageBucket: "catatcuan-c80e7.firebasestorage.app",
    messagingSenderId: "710147585850",
    appId: "1:710147585850:web:ea40be9f66cc6778100203"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app); 
const provider = new GoogleAuthProvider();

let currentUser = null; 
let chartInstance = null; 
let balanceChartInstance = null; 
let tabunganCharts = {};  
let expandedTabunganId = null; 
let semuaDataTransaksi = []; 
let dataAnggaranAktif = null; 
let editTabunganId = null; 

const loginSection = document.getElementById('login-section');
const appSection = document.getElementById('app-section');
const listRiwayat = document.getElementById('transaction-list');
const listTabungan = document.getElementById('list-tabungan');

// ================== LOGIKA EXPANDABLE SALDO UTAMA & GRAFIK DUAL-LINE ==================
const cardSaldoUtama = document.getElementById('card-saldo-utama');
const btnExpandSaldo = document.getElementById('btn-expand-saldo');
const saldoDetails = document.getElementById('saldo-details');
const filterTrendSaldo = document.getElementById('filter-trend-saldo');

btnExpandSaldo.addEventListener('click', () => {
    cardSaldoUtama.classList.toggle('expanded');
    if (cardSaldoUtama.classList.contains('expanded')) {
        saldoDetails.style.display = 'block';
        renderBalanceChart(); 
    } else { saldoDetails.style.display = 'none'; }
});

if(filterTrendSaldo) {
    filterTrendSaldo.addEventListener('change', () => {
        if (cardSaldoUtama.classList.contains('expanded')) renderBalanceChart();
    });
}

function renderBalanceChart() {
    const ctx = document.getElementById('chart-saldo-utama');
    if (!ctx) return;
    
    const daysToLookBack = parseInt(filterTrendSaldo.value) || 7;
    const labels = [];
    const dataBalances = [];
    const dataExpenses = []; 
    
    const sekarang = new Date();
    sekarang.setHours(23, 59, 59, 999); 

    for (let i = daysToLookBack - 1; i >= 0; i--) {
        const targetDate = new Date(sekarang);
        targetDate.setDate(sekarang.getDate() - i);
        
        const options = { day: 'numeric', month: 'short' };
        labels.push(targetDate.toLocaleDateString('id-ID', options));

        let dailyBalance = 0;
        let cumulativeExpense = 0;
        
        semuaDataTransaksi.forEach(trx => {
            if (trx.waktu <= targetDate) {
                if (trx.jenis === 'pemasukan') dailyBalance += trx.nominal;
                else { dailyBalance -= trx.nominal; cumulativeExpense += trx.nominal; }
            }
        });
        
        dataBalances.push(dailyBalance);
        dataExpenses.push(cumulativeExpense);
    }

    if (balanceChartInstance) balanceChartInstance.destroy();

    balanceChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Sisa Saldo', data: dataBalances, borderColor: '#2ecc71', backgroundColor: 'rgba(46, 204, 113, 0.1)',
                    borderWidth: 3, pointBackgroundColor: '#ffffff', pointBorderColor: '#2ecc71', pointRadius: 4, pointHoverRadius: 6, fill: true, tension: 0.4
                },
                {
                    label: 'Total Pengeluaran', data: dataExpenses, borderColor: '#e74c3c', backgroundColor: 'rgba(231, 76, 60, 0.1)',
                    borderWidth: 3, pointBackgroundColor: '#ffffff', pointBorderColor: '#e74c3c', pointRadius: 4, pointHoverRadius: 6, fill: true, tension: 0.4 
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: true, labels: { color: 'rgba(255, 255, 255, 0.9)', font: { size: 12 } } },
                tooltip: { callbacks: { label: function(context) { return context.dataset.label + ': Rp ' + context.parsed.y.toLocaleString('id-ID'); } } }
            },
            scales: {
                y: { beginAtZero: true, ticks: { color: 'rgba(255, 255, 255, 0.8)' }, grid: { color: 'rgba(255, 255, 255, 0.1)', drawBorder: false } },
                x: { ticks: { color: 'rgba(255, 255, 255, 0.9)', font: { size: 11 } }, grid: { display: false, drawBorder: false } }
            }
        }
    });
}

// ================== FITUR DROPDOWN KATEGORI ==================
const jenisInput = document.getElementById('jenis');
const kategoriInput = document.getElementById('kategori');

const opsiPengeluaran = `
    <option value="bensin">Bensin / Transportasi PP</option>
    <option value="makan">Makan / Kantin</option>
    <option value="akademik">Tugas / Akademik</option>
    <option value="tabungan">Nabung / Investasi</option>
    <option value="darurat">Lain-lain / Darurat</option>
`;
const opsiPemasukan = `
    <option value="uang_saku">Uang Saku dari Orang Tua</option>
    <option value="beasiswa_kse">Pencairan Beasiswa KSE</option>
    <option value="bantu_jualan">Bantu Usaha Jajanan Pasar Ayah</option>
    <option value="pemasukan_lain">Pemasukan Lainnya</option>
`;

jenisInput.addEventListener('change', function() {
    if (this.value === 'pengeluaran') kategoriInput.innerHTML = opsiPengeluaran;
    else kategoriInput.innerHTML = opsiPemasukan;
});
jenisInput.dispatchEvent(new Event('change'));

// ================== LOGIKA NAVIGASI TERPUSAT (SIDEBAR + PROFIL) ==================
const navLinks = document.querySelectorAll('.nav-link, .profile-nav-btn');
const views = document.querySelectorAll('.view-section');

navLinks.forEach(link => {
    link.addEventListener('click', () => {
        const targetId = link.getAttribute('data-target');
        
        views.forEach(v => v.classList.remove('active'));
        document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
        
        document.getElementById(targetId).classList.add('active');
        
        const sidebarLink = document.querySelector(`.nav-link[data-target="${targetId}"]`);
        if (sidebarLink) {
            sidebarLink.classList.add('active');
        } else {
            document.querySelector('.nav-link[data-target="view-profil"]').classList.add('active');
        }

        if(targetId === 'view-laporan') renderGrafik();
    });
});

// ================== FITUR DARK MODE & LOGO DINAMIS ==================
const btnThemeToggle = document.getElementById('btn-theme-toggle');
const themeIcon = document.getElementById('theme-icon');
const themeText = document.getElementById('theme-text');
const logoAplikasi = document.getElementById('logo-aplikasi');
const logoLogin = document.getElementById('logo-login'); 

if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-mode');
    if(themeIcon) themeIcon.innerText = 'light_mode';
    if(themeText) themeText.innerText = 'Mode Terang';
    if (logoAplikasi) logoAplikasi.src = 'img/catat cuan putih.png'; 
    if (logoLogin) logoLogin.src = 'img/catat cuan putih.png'; 
} else {
    if (logoAplikasi) logoAplikasi.src = 'img/catat cuan hitam.jpg'; 
    if (logoLogin) logoLogin.src = 'img/catat cuan hitam.jpg'; 
}

btnThemeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    if (document.body.classList.contains('dark-mode')) {
        localStorage.setItem('theme', 'dark');
        if(themeIcon) themeIcon.innerText = 'light_mode';
        if(themeText) themeText.innerText = 'Mode Terang';
        if (logoAplikasi) logoAplikasi.src = 'img/catat cuan putih.png';
        if (logoLogin) logoLogin.src = 'img/catat cuan putih.png';
    } else {
        localStorage.setItem('theme', 'light');
        if(themeIcon) themeIcon.innerText = 'dark_mode';
        if(themeText) themeText.innerText = 'Mode Gelap';
        if (logoAplikasi) logoAplikasi.src = 'img/catat cuan hitam.jpg';
        if (logoLogin) logoLogin.src = 'img/catat cuan hitam.jpg';
    }
    
    if (document.getElementById('view-laporan').classList.contains('active')) renderGrafik();
    if (document.getElementById('view-tabungan').classList.contains('active') && expandedTabunganId) {
        const canvas = document.getElementById(`chart-tabungan-${expandedTabunganId}`);
        if(canvas) renderTabunganChart(expandedTabunganId, parseFloat(canvas.dataset.terkumpul), parseFloat(canvas.dataset.target));
    }
});

// ================== LOGIKA LOGIN & LOGOUT ==================
document.getElementById('btn-google-login').addEventListener('click', async () => {
    try { await signInWithPopup(auth, provider); } 
    catch (error) { alert("Gagal login dengan Google."); }
});

document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        loginSection.style.display = 'none'; 
        appSection.style.display = 'flex'; 
        
        const userEmailElement = document.getElementById('user-email');
        if(userEmailElement) userEmailElement.innerText = user.email;

        muatDataTransaksi(user.uid);
        muatDataTabungan(user.uid); 
        muatDataAnggaran(user.uid); 
    } else {
        currentUser = null;
        loginSection.style.display = 'flex';
        appSection.style.display = 'none';
    }
});

// ================== LOGIKA SIMPAN TRANSAKSI ==================
document.getElementById('form-transaksi').addEventListener('submit', async function(e) {
    e.preventDefault(); 
    if (!currentUser) return; 

    const jenis = document.getElementById('jenis').value;
    const kategori = document.getElementById('kategori').value;
    const nominal = parseInt(document.getElementById('nominal').value);
    const catatan = document.getElementById('catatan').value;

    try {
        await addDoc(collection(db, "transaksi"), {
            uid: currentUser.uid, jenis: jenis, kategori: kategori, nominal: nominal, catatan: catatan, waktu: new Date() 
        });
        this.reset(); 
        jenisInput.dispatchEvent(new Event('change')); 
        alert("Transaksi berhasil disimpan!");
        document.querySelector('[data-target="view-riwayat"]').click();
    } catch (error) { console.error("Error: ", error); }
});

// ================== LOGIKA BACA DATA TRANSAKSI ==================
let unsubscribeTrx = null; 

function muatDataTransaksi(userId) {
    if (unsubscribeTrx) unsubscribeTrx(); 
    const q = query(collection(db, "transaksi"), where("uid", "==", userId), orderBy("waktu", "desc"));

    unsubscribeTrx = onSnapshot(q, (snapshot) => {
        listRiwayat.innerHTML = ''; 
        let totalSaldo = 0; let totalMasuk = 0; let totalKeluar = 0;
        semuaDataTransaksi = []; 

        snapshot.forEach((doc) => {
            const data = doc.data();
            semuaDataTransaksi.push({ ...data, waktu: data.waktu.toDate() });

            if (data.jenis === 'pemasukan') { totalMasuk += data.nominal; totalSaldo += data.nominal; } 
            else { totalKeluar += data.nominal; totalSaldo -= data.nominal; }

            const li = document.createElement('li');
            li.className = `transaction-item ${data.jenis === 'pengeluaran' ? 'keluar' : 'masuk'}`;
            li.innerHTML = `
                <div class="details">
                    <span class="cat">${data.kategori.replace(/_/g, ' ').toUpperCase()}</span>
                    <span class="note">${data.catatan}</span>
                    <span class="note" style="font-size:10px; opacity:0.7;">${data.waktu.toDate().toLocaleDateString('id-ID')}</span>
                </div>
                <div class="action-wrapper">
                    <span class="amount">${data.jenis === 'pengeluaran' ? '-' : '+'} Rp ${data.nominal.toLocaleString('id-ID')}</span>
                    <div class="dropdown-container">
                        <button class="btn-dots btn-action" data-id="${doc.id}">&#8942;</button>
                        <div class="dropdown-menu">
                            <button class="dropdown-item text-danger btn-delete-item" data-id="${doc.id}">Hapus Transaksi</button>
                        </div>
                    </div>
                </div>
            `;
            listRiwayat.appendChild(li);
        });

        document.getElementById('total-saldo').innerText = `Rp ${totalSaldo.toLocaleString('id-ID')}`;
        document.getElementById('total-masuk').innerText = `Rp ${totalMasuk.toLocaleString('id-ID')}`;
        document.getElementById('total-keluar').innerText = `Rp ${totalKeluar.toLocaleString('id-ID')}`;
        document.getElementById('detail-total-masuk').innerText = `Rp ${totalMasuk.toLocaleString('id-ID')}`;
        document.getElementById('detail-total-keluar').innerText = `Rp ${totalKeluar.toLocaleString('id-ID')}`;

        const badgeTrend = document.getElementById('balance-badge-trend');
        const selisih = totalMasuk - totalKeluar;
        if (selisih > 0) { badgeTrend.innerText = 'Keuangan Sehat 🚀'; badgeTrend.style.background = 'rgba(46, 204, 113, 0.3)'; } 
        else if (selisih < 0) { badgeTrend.innerText = 'Pasak > Tiang 📉'; badgeTrend.style.background = 'rgba(231, 76, 60, 0.3)'; } 
        else { badgeTrend.innerText = 'Saldo Stabil ⚖️'; badgeTrend.style.background = 'rgba(255, 255, 255, 0.2)'; }

        if (cardSaldoUtama.classList.contains('expanded')) renderBalanceChart();
        renderGrafik();
        renderAnggaranUI();
    });
}

// ================== LOGIKA FITUR ANGGARAN (STOPWATCH SYSTEM) ==================
document.getElementById('form-anggaran').addEventListener('submit', async function(e) {
    e.preventDefault();
    if (!currentUser) return;
    
    const limitNominal = parseInt(document.getElementById('nominal-anggaran').value);
    const periode = document.getElementById('periode-anggaran').value;
    
    const waktuMulai = new Date();
    const waktuBerakhir = new Date(waktuMulai);
    if (periode === 'mingguan') {
        waktuBerakhir.setDate(waktuBerakhir.getDate() + 7);
    } else {
        waktuBerakhir.setMonth(waktuBerakhir.getMonth() + 1);
    }
    
    try {
        await setDoc(doc(db, "anggaran", currentUser.uid), { 
            limit: limitNominal, 
            periode: periode,
            waktuDibuat: waktuMulai,
            waktuBerakhir: waktuBerakhir
        });
        alert(`Anggaran ${periode} berhasil diaktifkan! Menghitung mulai sekarang.`);
        document.getElementById('form-anggaran').reset();
    } catch (error) { alert("Gagal mengatur anggaran."); }
});

document.getElementById('btn-hapus-anggaran').addEventListener('click', async () => {
    if(confirm("Yakin ingin menghapus batas anggaran ini?\nTenang, data transaksi kamu tidak akan hilang.")) {
        try {
            await deleteDoc(doc(db, "anggaran", currentUser.uid));
            alert("Fitur Anggaran dinonaktifkan.");
        } catch (error) { alert("Gagal menghapus."); }
    }
});

let unsubscribeAnggaran = null;
function muatDataAnggaran(userId) {
    if (unsubscribeAnggaran) unsubscribeAnggaran();
    unsubscribeAnggaran = onSnapshot(doc(db, "anggaran", userId), (docSnap) => {
        if (docSnap.exists()) {
            dataAnggaranAktif = docSnap.data();
            document.getElementById('container-form-anggaran').style.display = 'none';
            document.getElementById('container-anggaran-aktif').style.display = 'block';
            document.getElementById('btn-hapus-anggaran').style.display = 'block';
            renderAnggaranUI(); 
        } else {
            dataAnggaranAktif = null;
            document.getElementById('container-form-anggaran').style.display = 'block';
            document.getElementById('container-anggaran-aktif').style.display = 'none';
            document.getElementById('btn-hapus-anggaran').style.display = 'none';
        }
    });
}

function renderAnggaranUI() {
    if (!dataAnggaranAktif) return;

    const limit = dataAnggaranAktif.limit;
    const periodeTipe = dataAnggaranAktif.periode || 'bulanan';
    
    const waktuMulai = dataAnggaranAktif.waktuDibuat.toDate ? dataAnggaranAktif.waktuDibuat.toDate() : new Date(dataAnggaranAktif.waktuDibuat);
    const waktuBerakhir = dataAnggaranAktif.waktuBerakhir.toDate ? dataAnggaranAktif.waktuBerakhir.toDate() : new Date(dataAnggaranAktif.waktuBerakhir);
    
    const opsiTanggal = { day: 'numeric', month: 'short', year: 'numeric' };
    const teksPeriode = `${waktuMulai.toLocaleDateString('id-ID', opsiTanggal)} - ${waktuBerakhir.toLocaleDateString('id-ID', opsiTanggal)}`;
    
    document.getElementById('teks-periode-anggaran').innerText = teksPeriode;
    document.getElementById('label-periode-tipe').innerText = periodeTipe.charAt(0).toUpperCase() + periodeTipe.slice(1);

    let terpakaiDalamPeriode = 0;
    semuaDataTransaksi.forEach(trx => {
        if (trx.jenis === 'pengeluaran' && trx.waktu >= waktuMulai && trx.waktu <= waktuBerakhir) {
            terpakaiDalamPeriode += trx.nominal;
        }
    });

    let persentase = (terpakaiDalamPeriode / limit) * 100;
    let sisa = limit - terpakaiDalamPeriode;
    
    const barFill = document.getElementById('budget-progress-fill');
    const txtStatus = document.getElementById('teks-status-anggaran');
    const iconStatus = document.getElementById('icon-status-anggaran');
    
    document.getElementById('teks-terpakai-anggaran').innerText = `Terpakai: Rp ${terpakaiDalamPeriode.toLocaleString('id-ID')}`;
    document.getElementById('teks-limit-anggaran').innerText = `Rp ${limit.toLocaleString('id-ID')}`;
    document.getElementById('teks-sisa-anggaran').innerText = sisa > 0 ? `Rp ${sisa.toLocaleString('id-ID')}` : "Rp 0 (Habis)";
    
    document.getElementById('teks-persen-anggaran').innerText = `${persentase.toFixed(1)}%`;
    barFill.style.width = `${Math.min(persentase, 100)}%`;
    
    barFill.className = 'budget-progress-fill';
    iconStatus.className = 'material-symbols-rounded budget-icon';

    const sekarang = new Date();
    if (sekarang > waktuBerakhir) {
        iconStatus.classList.add('safe');
        iconStatus.innerText = 'history';
        txtStatus.innerText = 'Periode Selesai 🏁';
        txtStatus.style.color = '#7f8c8d';
        barFill.classList.add('safe');
        document.getElementById('teks-periode-anggaran').innerText += " (Berakhir)";
        return; 
    }

    if (persentase <= 50) {
        barFill.classList.add('safe');
        iconStatus.classList.add('safe');
        iconStatus.innerText = 'verified';
        txtStatus.innerText = 'Aman Terkendali 🟢';
        txtStatus.style.color = '#2ecc71';
    } else if (persentase <= 80) {
        barFill.classList.add('warn');
        iconStatus.classList.add('warn');
        iconStatus.innerText = 'warning';
        txtStatus.innerText = 'Mulai Hati-Hati 🟡';
        txtStatus.style.color = '#f39c12';
    } else if (persentase <= 100) {
        barFill.classList.add('danger');
        iconStatus.classList.add('danger');
        iconStatus.innerText = 'error';
        txtStatus.innerText = 'Hampir Batas Limit! 🔴';
        txtStatus.style.color = '#e74c3c';
    } else {
        barFill.classList.add('danger');
        iconStatus.classList.add('danger');
        iconStatus.innerText = 'dangerous';
        txtStatus.innerText = 'Overbudget! (Bocor) 💥';
        txtStatus.style.color = '#c0392b';
        document.getElementById('teks-sisa-anggaran').innerHTML = `<span style="color:#e74c3c">Minus Rp ${Math.abs(sisa).toLocaleString('id-ID')}</span>`;
    }
}


// ================== LOGIKA FITUR TABUNGAN ==================
const btnTampilForm = document.getElementById('btn-tampil-form-tabungan');
const btnBatalForm = document.getElementById('btn-batal-tabungan');
const containerForm = document.getElementById('container-form-tabungan');

function resetFormTabunganState() {
    editTabunganId = null;
    document.getElementById('form-tabungan').reset();
    document.getElementById('awal-tabungan').parentElement.style.display = 'block'; 
    document.querySelector('#container-form-tabungan h2').innerText = "Buat Target Baru";
    document.querySelector('#form-tabungan button[type="submit"]').innerText = "Mulai Menabung";
}

btnTampilForm.addEventListener('click', () => {
    resetFormTabunganState();
    containerForm.style.display = 'block';
    btnTampilForm.style.display = 'none';
});

btnBatalForm.addEventListener('click', () => {
    containerForm.style.display = 'none';
    btnTampilForm.style.display = 'block';
    resetFormTabunganState();
});

document.getElementById('form-tabungan').addEventListener('submit', async function(e) {
    e.preventDefault();
    if (!currentUser) return;

    const nama = document.getElementById('nama-tabungan').value;
    const target = parseInt(document.getElementById('target-tabungan').value);

    try {
        if (editTabunganId) {
            await updateDoc(doc(db, "tabungan", editTabunganId), { nama: nama, target: target });
            alert("Perubahan tabungan berhasil disimpan!");
        } else {
            let terkumpul = parseInt(document.getElementById('awal-tabungan').value);
            if(isNaN(terkumpul)) terkumpul = 0; 
            
            await addDoc(collection(db, "tabungan"), { uid: currentUser.uid, nama: nama, target: target, terkumpul: terkumpul, waktuDibuat: new Date() });
            alert("Target Tabungan berhasil dibuat!");
        }
        containerForm.style.display = 'none';
        btnTampilForm.style.display = 'block';
        resetFormTabunganState();
    } catch (error) { console.error("Error Tabungan: ", error); }
});

function renderTabunganChart(id, terkumpul, target) {
    const ctx = document.getElementById(`chart-tabungan-${id}`);
    if(!ctx) return;
    if(tabunganCharts[id]) tabunganCharts[id].destroy();

    const sisa = Math.max(0, target - terkumpul);
    const isTercapai = terkumpul >= target;
    const colorText = document.body.classList.contains('dark-mode') ? '#aaaaaa' : '#666666';
    const colorEmpty = document.body.classList.contains('dark-mode') ? '#333333' : '#eeeeee';

    Chart.defaults.color = colorText;

    tabunganCharts[id] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Terkumpul', 'Kekurangan'],
            datasets: [{ data: [terkumpul, sisa], backgroundColor: ['#2ecc71', isTercapai ? '#2ecc71' : colorEmpty], borderWidth: 0, hoverOffset: 4 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '75%',
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(context) { let label = context.label || ''; if (label) label += ': '; if (context.parsed !== null) label += 'Rp ' + context.parsed.toLocaleString('id-ID'); return label; } } } }
        }
    });
}

let unsubscribeTabungan = null;
function muatDataTabungan(userId) {
    if (unsubscribeTabungan) unsubscribeTabungan();
    const q = query(collection(db, "tabungan"), where("uid", "==", userId));

    unsubscribeTabungan = onSnapshot(q, (snapshot) => {
        listTabungan.innerHTML = '';
        Object.values(tabunganCharts).forEach(chart => chart.destroy());
        tabunganCharts = {};
        let chartToRenderDelay = null;

        snapshot.forEach((doc) => {
            const data = doc.data();
            let persen = (data.terkumpul / data.target) * 100;
            if (persen > 100) persen = 100; 

            const sisaKekurangan = data.target - data.terkumpul;
            const teksSisa = sisaKekurangan > 0 ? `Rp ${sisaKekurangan.toLocaleString('id-ID')}` : "✅ Tercapai!";
            const tanggalDibuat = data.waktuDibuat ? data.waktuDibuat.toDate().toLocaleDateString('id-ID', {day:'numeric', month:'long', year:'numeric'}) : '-';

            let motivasi = ""; let badgeClass = "";
            if (persen >= 100) { motivasi = "Tercapai! 🎉"; badgeClass = "badge-end"; }
            else if (persen >= 70) { motivasi = "Sedikit lagi! 🔥"; badgeClass = "badge-end"; }
            else if (persen >= 30) { motivasi = "Setengah jalan 🚀"; badgeClass = "badge-mid"; }
            else { motivasi = "Perjalanan dimulai 🎯"; badgeClass = "badge-start"; }

            const isExpanded = expandedTabunganId === doc.id;
            const card = document.createElement('div');
            card.className = `saving-card ${isExpanded ? 'expanded' : ''}`;
            
            card.innerHTML = `
                <div class="saving-clickable-area">
                    <div class="saving-header">
                        <div class="saving-title-wrapper">
                            <div class="saving-title">🎯 ${data.nama}</div>
                            <div class="saving-badge ${badgeClass}">${motivasi}</div>
                        </div>
                        <div class="dropdown-container">
                            <button class="btn-dots btn-action" data-id="${doc.id}">&#8942;</button>
                            <div class="dropdown-menu">
                                <button class="dropdown-item btn-edit-fund" data-id="${doc.id}" data-nama="${data.nama}" data-target="${data.target}">✏️ Edit Tabungan</button>
                                <button class="dropdown-item text-danger btn-delete-fund" data-id="${doc.id}">🗑️ Hapus Tabungan</button>
                            </div>
                        </div>
                    </div>
                    <div class="progress-container">
                        <div class="progress-bar" style="width: ${persen}%"></div>
                    </div>
                    <div class="saving-stats">
                        <span>Rp ${data.terkumpul.toLocaleString('id-ID')}</span>
                        <span>${persen.toFixed(1)}%</span>
                    </div>
                </div>
                
                <div class="saving-details" style="display: ${isExpanded ? 'block' : 'none'};">
                    <div class="saving-details-flex">
                        <div class="saving-info-text">
                            <p><strong>Dibuat pada:</strong> ${tanggalDibuat}</p>
                            <p><strong>Target Dana:</strong> Rp ${data.target.toLocaleString('id-ID')}</p>
                            <p><strong>Total Terkumpul:</strong> Rp ${data.terkumpul.toLocaleString('id-ID')}</p>
                            <p><strong>Kekurangan:</strong> <span style="color:#e74c3c; font-weight:bold;">${teksSisa}</span></p>
                        </div>
                        <div class="saving-chart-wrapper">
                            <canvas id="chart-tabungan-${doc.id}" data-terkumpul="${data.terkumpul}" data-target="${data.target}"></canvas>
                            <div style="position: absolute; text-align: center; font-weight: bold; font-size: 20px; color: var(--text-main);">${persen.toFixed(0)}%</div>
                        </div>
                    </div>

                    <div style="margin-top: 20px; padding-top: 15px; border-top: 1px dashed var(--border-color);">
                        <label style="font-size: 12px; margin-bottom: 8px; display: block; color: var(--text-main); font-weight: bold;">Top-Up Tabungan:</label>
                        <select id="sumber-fund-${doc.id}" style="width: 100%; padding: 10px; border: 1px solid var(--input-border); border-radius: 8px; background: var(--input-bg); color: var(--text-main); font-size: 13px; outline: none; cursor: pointer;">
                            <option value="saldo">💸 Potong dari Saldo Dompet</option>
                            <option value="luar">💰 Dari Sumber Luar (Tidak potong saldo)</option>
                        </select>
                        <div class="fund-action-group">
                            <input type="number" id="input-fund-${doc.id}" class="add-fund-input" placeholder="Isi nominal top up..." min="1">
                            <button class="btn-submit-fund" data-id="${doc.id}" data-terkumpul="${data.terkumpul}" data-nama="${data.nama}">+</button>
                        </div>
                    </div>
                </div>
            `;
            
            const clickableArea = card.querySelector('.saving-clickable-area');
            clickableArea.addEventListener('click', (e) => {
                if(e.target.closest('.dropdown-container')) return;
                if (expandedTabunganId === doc.id) {
                    expandedTabunganId = null;
                    card.classList.remove('expanded');
                    card.querySelector('.saving-details').style.display = 'none';
                } else {
                    document.querySelectorAll('.saving-card.expanded').forEach(c => { c.classList.remove('expanded'); c.querySelector('.saving-details').style.display = 'none'; });
                    expandedTabunganId = doc.id;
                    card.classList.add('expanded');
                    card.querySelector('.saving-details').style.display = 'block';
                    renderTabunganChart(doc.id, data.terkumpul, data.target);
                    setTimeout(() => { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 200);
                }
            });

            listTabungan.appendChild(card);
            if (isExpanded) chartToRenderDelay = { id: doc.id, terkumpul: data.terkumpul, target: data.target };
        });

        if (chartToRenderDelay) setTimeout(() => { renderTabunganChart(chartToRenderDelay.id, chartToRenderDelay.terkumpul, chartToRenderDelay.target); }, 100);
    });
}

// ================== LOGIKA KLIK GLOBAL ==================
document.addEventListener('click', async (e) => {
    const isActionButton = e.target.classList.contains('btn-action');
    if (!isActionButton) document.querySelectorAll('.dropdown-menu').forEach(menu => menu.classList.remove('show'));
    else {
        document.querySelectorAll('.dropdown-menu').forEach(menu => { if (menu !== e.target.nextElementSibling) menu.classList.remove('show'); });
        e.target.nextElementSibling.classList.toggle('show');
    }

    if (e.target.classList.contains('btn-edit-fund')) {
        editTabunganId = e.target.getAttribute('data-id');
        document.getElementById('nama-tabungan').value = e.target.getAttribute('data-nama');
        document.getElementById('target-tabungan').value = e.target.getAttribute('data-target');
        document.getElementById('awal-tabungan').parentElement.style.display = 'none'; 
        document.querySelector('#container-form-tabungan h2').innerText = "Edit Target Tabungan";
        document.querySelector('#form-tabungan button[type="submit"]').innerText = "Simpan Perubahan";
        document.getElementById('container-form-tabungan').style.display = 'block';
        document.getElementById('btn-tampil-form-tabungan').style.display = 'none';
    }

    if (e.target.classList.contains('btn-delete-fund')) {
        if (confirm("Yakin ingin menghapus target tabungan ini?")) await deleteDoc(doc(db, "tabungan", e.target.getAttribute('data-id')));
    }

    if (e.target.classList.contains('btn-delete-item')) {
        if (confirm("Hapus transaksi ini?")) await deleteDoc(doc(db, "transaksi", e.target.getAttribute('data-id')));
    }

    if (e.target.classList.contains('btn-submit-fund')) {
        const docId = e.target.getAttribute('data-id');
        const terkumpulSaatIni = parseInt(e.target.getAttribute('data-terkumpul'));
        const namaTabungan = e.target.getAttribute('data-nama');
        const inputField = document.getElementById(`input-fund-${docId}`);
        const sumberField = document.getElementById(`sumber-fund-${docId}`);
        const nominalTambah = parseInt(inputField.value);
        const sumberDana = sumberField ? sumberField.value : 'luar';

        if (!isNaN(nominalTambah) && nominalTambah > 0) {
            try {
                await updateDoc(doc(db, "tabungan", docId), { terkumpul: terkumpulSaatIni + nominalTambah });
                if (sumberDana === 'saldo') {
                    await addDoc(collection(db, "transaksi"), { uid: currentUser.uid, jenis: 'pengeluaran', kategori: 'tabungan', nominal: nominalTambah, catatan: `Nabung: ${namaTabungan}`, waktu: new Date() });
                    alert(`Berhasil! Saldo dompet terpotong Rp ${nominalTambah.toLocaleString('id-ID')} untuk tabungan.`);
                } else alert("Berhasil top-up dari sumber luar!");
                inputField.value = ""; 
            } catch (error) { 
                console.error(error);
                alert("Gagal menyimpan tabungan."); 
            }
        } else {
            const inputGroup = inputField.parentElement;
            inputGroup.style.borderColor = '#e74c3c';
            setTimeout(() => inputGroup.style.borderColor = 'var(--input-border)', 2000);
        }
    }

    if (e.target.id === 'btn-reset-data') {
        if (confirm("PERINGATAN!\n\nApakah kamu yakin mereset SEMUA SALDO DAN RIWAYAT?")) {
            try {
                const q = query(collection(db, "transaksi"), where("uid", "==", currentUser.uid));
                const querySnapshot = await getDocs(q);
                querySnapshot.forEach(async (document) => { await deleteDoc(doc(db, "transaksi", document.id)); });
                alert("Dompet berhasil direset!");
            } catch (error) { alert("Gagal mereset data."); }
        }
    }
});

// ================== LOGIKA GRAFIK CHART.JS (LAPORAN) ==================
const filterLaporan = document.getElementById('filter-laporan');
if (filterLaporan) filterLaporan.addEventListener('change', renderGrafik);

function renderGrafik() {
    if (!filterLaporan) return; 
    if(document.getElementById('view-laporan').style.display === 'none' && !document.getElementById('view-laporan').classList.contains('active')) return;

    Chart.defaults.color = document.body.classList.contains('dark-mode') ? '#aaaaaa' : '#666666';

    const filter = filterLaporan.value;
    const sekarang = new Date();
    let totalPerKategori = { bensin: 0, makan: 0, akademik: 0, tabungan: 0, darurat: 0 };

    semuaDataTransaksi.forEach(trx => {
        if (trx.jenis === 'pengeluaran') {
            const waktuTrx = trx.waktu;
            const selisihHari = (sekarang - waktuTrx) / (1000 * 60 * 60 * 24);

            let masukKriteria = false;
            if (filter === 'harian' && selisihHari < 1 && waktuTrx.getDate() === sekarang.getDate()) masukKriteria = true;
            else if (filter === 'mingguan' && selisihHari <= 7) masukKriteria = true;
            else if (filter === 'bulanan' && selisihHari <= 30) masukKriteria = true;

            if (masukKriteria && totalPerKategori[trx.kategori] !== undefined) totalPerKategori[trx.kategori] += trx.nominal;
        }
    });

    const dataNominal = [totalPerKategori.bensin, totalPerKategori.makan, totalPerKategori.akademik, totalPerKategori.tabungan, totalPerKategori.darurat];
    const canvasGrafik = document.getElementById('grafik-laporan');
    if (!canvasGrafik) return;
    const ctx = canvasGrafik.getContext('2d');

    if (chartInstance) chartInstance.destroy(); 

    chartInstance = new Chart(ctx, {
        type: 'doughnut', 
        data: {
            labels: ['Bensin/Transport', 'Makan/Kantin', 'Tugas/Akademik', 'Nabung/Investasi', 'Darurat/Lainnya'],
            datasets: [{ data: dataNominal, backgroundColor: ['#e74c3c', '#f1c40f', '#3498db', '#9b59b6', '#95a5a6'], borderWidth: 2, borderColor: document.body.classList.contains('dark-mode') ? '#1e1e1e' : '#ffffff' }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
}
