/**
 * HR — Employee directory dataset (mini-DB). Employees of PT Central Perk
 * Indonesia (the coffee business the rest of the ERP mock revolves around).
 *
 * Snapshot-persisted under `erp-db:employees-v1` (whole array wins over the seed
 * on load), same pattern as couriers.ts / warehouseTeam.ts. Mirrors the venom
 * "People" employee model so the directory table and details page map 1:1.
 */
import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import { warehouses } from './warehouses'

// 'resigning' = resignation submitted, still serving out the notice period (the
// "Leaving" stat); 'resigned' = already left.
export type EmployeeStatus = 'active' | 'resigned' | 'resigning'

export interface FamilyMember {
  id: string
  name: string
  relationship: string          // Spouse | Child | Parent | Sibling
  birthDate?: string
  citizenId?: string
  maritalStatus?: string
  gender?: string
  occupation?: string           // what they do (job)
  religion?: string
  reimbursementEligible?: boolean
}

export interface EmergencyContact {
  id: string
  name: string
  relationship: string
  phone: string
}

export interface WorkExperience {
  id: string
  company: string
  position: string
  startYear: string
  endYear: string
}

// How an HRIS typically stores an education record: institution + degree/level +
// field of study (major) + period + grade (GPA/predikat) + an optional uploaded
// certificate/ijazah document.
export interface EducationRecord {
  id: string
  institution: string      // school / university name
  degree: string           // e.g. Bachelor's degree (S1), High school
  fieldOfStudy: string     // major
  startYear: string
  endYear: string
  grade?: string           // GPA / predikat
  certificateUrl?: string  // uploaded ijazah/certificate — downloadable when present
}

// Informal education — non-degree training / courses / certifications.
export interface InformalEducation {
  id: string
  name: string             // course / training / certification name
  organizer: string        // provider / institution
  startYear: string
  endYear: string
  certificateUrl?: string
}

export interface Employee {
  id: string
  employeeId: string           // EMP-0001

  fullName: string
  photo?: string
  gender?: string
  dateOfBirth?: string
  placeOfBirth?: string
  religion?: string
  maritalStatus?: string
  nationality?: string
  nik?: string
  bloodType?: string

  email?: string
  personalEmail?: string
  phone?: string
  additionalPhone?: string
  passportNo?: string
  passportExpiry?: string
  passportCountry?: string
  ktpAddress?: string
  currentAddress?: string
  emergencyName?: string
  emergencyRelationship?: string
  emergencyPhone?: string

  barcode?: string             // employee barcode / attendance card number

  jobPosition?: string
  department?: string          // shown as "Organization"
  branch?: string
  businessUnit?: string
  jobLevel?: string            // Director | Manager | Staff
  jobGrade?: string
  jobClass?: string
  employmentStatus?: string    // Permanent | Probation | Part-time | Contract
  status: EmployeeStatus
  joinDate?: string            // date the employee started
  signDate?: string            // date the employment contract / letter was signed
  resignDate?: string
  directManager?: string
  contractEndDate?: string     // end date for fixed-term (Contract / Probation)

  basicSalary?: number
  salaryType?: string
  bankName?: string
  bankAccountNumber?: string
  bankAccountHolder?: string
  overtimeEligible?: boolean
  thrEligible?: boolean

  npwp?: string
  ptkpStatus?: string
  taxMethod?: string

  bpjsKesehatanNo?: string
  bpjsKesehatanFaskes?: string
  bpjsKesehatanClass?: string
  bpjsKetenagakerjaanNo?: string

  lastEducation?: string
  major?: string
  institution?: string

  family?: FamilyMember[]
  emergencyContacts?: EmergencyContact[]
  education?: EducationRecord[]
  informalEducation?: InformalEducation[]
  workExperience?: WorkExperience[]

  updatedAt?: string
  updatedBy?: string
}

// Master-data option lists (drive the directory filters + future create form).
export const employmentStatuses = ['Permanent', 'Probation', 'Part-time', 'Contract']
export const jobLevels = ['Director', 'Manager', 'Staff']
// Branch = warehouse. Sourced from the warehouses dataset so the two stay coherent.
export const branches = warehouses.filter((w) => w.name.startsWith('Gudang')).map((w) => w.name)
export const departments = ['Operations', 'Finance', 'People', 'Marketing', 'Warehouse', 'Production', 'Technology', 'Sales']
export const businessUnits = ['Retail Coffee', 'Wholesale', 'Corporate']

// Employee avatar photos (borrowed from talenta-performance-d — names need not
// match). Split by the gender of the person in each illustration so a derived
// avatar always matches the employee's gender.
const MALE_AVATARS = ['agung.jpg', 'alfian.jpg', 'ali.jpg', 'andi.jpg', 'bayu.jpg', 'daud.jpg', 'eka.jpg', 'fajar.jpg', 'galih.jpg', 'joko.jpg', 'rio.jpg', 'rizal.jpg']
const FEMALE_AVATARS = ['christin.jpg', 'cinta.jpg', 'evelyn.jpg', 'indah.jpg', 'jessie.jpg']

// Fill sensible Indonesian-HR defaults so a detail page is never empty. Sign date
// and barcode are derived (contract signed ~2 weeks before joining; barcode from
// the employee number) when not given explicitly.
function emp(p: Partial<Employee> & Pick<Employee, 'employeeId' | 'fullName'>): Employee {
  const merged: Employee = {
    id: p.id ?? p.employeeId,
    status: 'active',
    nationality: 'WNI',
    religion: 'Islam',
    maritalStatus: 'Single',
    bloodType: 'O',
    gender: 'Male',
    salaryType: 'Monthly',
    ptkpStatus: 'TK/0',
    taxMethod: 'Gross',
    overtimeEligible: false,
    thrEligible: true,
    bankName: 'Bank BCA',
    bpjsKesehatanClass: 'Class 1',
    bpjsKesehatanFaskes: 'Klinik Sehat Sentosa',
    branch: 'Gudang Jakarta Pusat',
    businessUnit: 'Retail Coffee',
    lastEducation: 'S1',
    updatedBy: 'Rizal Candra',
    updatedAt: '2026-08-14T09:00:00',
    ...p,
  }
  if (!merged.signDate && merged.joinDate) {
    const d = new Date(merged.joinDate)
    d.setDate(d.getDate() - 14)
    merged.signDate = d.toISOString().slice(0, 10)
  }
  if (!merged.photo) {
    const n = Number(merged.employeeId.replace(/\D/g, '')) || 1
    const pool = merged.gender === 'Female' ? FEMALE_AVATARS : MALE_AVATARS
    merged.photo = `/avatars/${pool[(n - 1) % pool.length]}`
  }
  if (!merged.barcode) merged.barcode = `89${merged.employeeId.replace(/\D/g, '')}`
  if (!merged.nik) merged.nik = `3171${merged.employeeId.replace(/\D/g, '')}0000000000`.slice(0, 16)
  if (!merged.jobGrade) merged.jobGrade = merged.jobLevel === 'Director' ? 'G1' : merged.jobLevel === 'Manager' ? 'G3' : 'G5'
  if (!merged.jobClass) merged.jobClass = merged.jobLevel === 'Director' ? 'Class A' : merged.jobLevel === 'Manager' ? 'Class B' : 'Class C'
  return merged
}

const SEED: Employee[] = [
  emp({
    employeeId: 'EMP-0001', fullName: 'Rizal Candra', gender: 'Male',
    jobPosition: 'Chief Operating Officer', department: 'Operations', jobLevel: 'Director',
    businessUnit: 'Corporate', employmentStatus: 'Permanent', joinDate: '2018-02-01',
    email: 'rizal.candra@centralperk.co.id', personalEmail: 'rizalcandra@gmail.com', phone: '+62 811-1900-2001', additionalPhone: '+62 812-1111-2002',
    passportNo: 'X1234567', passportExpiry: '2029-06-30', passportCountry: 'Indonesia',
    dateOfBirth: '1985-04-12', placeOfBirth: 'Jakarta', maritalStatus: 'Married',
    nik: '3171041204850001', npwp: '09.254.812.3-011.000', ptkpStatus: 'K/2',
    directManager: '—', basicSalary: 65_000_000, overtimeEligible: false,
    bankAccountNumber: '5485079642', bankAccountHolder: 'Rizal Candra',
    bpjsKesehatanNo: '0001234567801', bpjsKetenagakerjaanNo: '18010012345',
    ktpAddress: 'Jl. Kemang Raya No. 12, Jakarta Selatan', currentAddress: 'Jl. Kemang Raya No. 12, Jakarta Selatan',
    emergencyName: 'Sari Candra', emergencyRelationship: 'Spouse', emergencyPhone: '+62 812-9000-1122',
    major: 'Business Management', institution: 'Universitas Indonesia',
    family: [
      { id: 'fam-0001-1', name: 'Sari Candra',    relationship: 'Spouse', birthDate: '1987-08-20', citizenId: '3171082008870002', maritalStatus: 'Married', gender: 'Female', occupation: 'Entrepreneur', religion: 'Islam', reimbursementEligible: true },
      { id: 'fam-0001-2', name: 'Bima Candra',    relationship: 'Child',  birthDate: '2014-03-10', citizenId: '3171031014140003', maritalStatus: 'Single',  gender: 'Male',   occupation: 'Student',      religion: 'Islam', reimbursementEligible: true },
      { id: 'fam-0001-3', name: 'Kirana Candra',  relationship: 'Child',  birthDate: '2017-11-05', citizenId: '3171051117170004', maritalStatus: 'Single',  gender: 'Female', occupation: 'Student',      religion: 'Islam', reimbursementEligible: true },
    ],
    emergencyContacts: [
      { id: 'ec-0001-1', name: 'Sari Candra',  relationship: 'Spouse',  phone: '+62 812-9000-1122' },
      { id: 'ec-0001-2', name: 'Rudi Candra',  relationship: 'Sibling', phone: '+62 813-4545-6767' },
    ],
    education: [
      { id: 'edu-0001-1', institution: 'Universitas Indonesia', degree: "Bachelor's degree (S1)", fieldOfStudy: 'Business Management', startYear: '2004', endYear: '2008', grade: '3.72 / 4.00', certificateUrl: '/avatars/agung.jpg' },
      { id: 'edu-0001-2', institution: 'SMA Negeri 8 Jakarta',  degree: 'High school',            fieldOfStudy: 'Science',             startYear: '2001', endYear: '2004', grade: '—' },
    ],
    informalEducation: [
      { id: 'inf-0001-1', name: 'Coffee Business Management',   organizer: 'Specialty Coffee Association', startYear: '2019', endYear: '2019', certificateUrl: '/avatars/ali.jpg' },
      { id: 'inf-0001-2', name: 'Executive Leadership Program', organizer: 'Prasetiya Mulya',              startYear: '2021', endYear: '2021' },
    ],
    workExperience: [
      { id: 'we-0001-1', company: 'PT Kopi Nusantara',  position: 'Operations Manager', startYear: '2013', endYear: '2017' },
      { id: 'we-0001-2', company: 'PT Ritel Sejahtera', position: 'Store Supervisor',    startYear: '2010', endYear: '2013' },
    ],
  }),
  emp({
    employeeId: 'EMP-0002', fullName: 'Anita Wijaya', gender: 'Female',
    jobPosition: 'Finance Manager', department: 'Finance', jobLevel: 'Manager',
    businessUnit: 'Corporate', employmentStatus: 'Permanent', joinDate: '2019-06-17',
    email: 'anita.wijaya@centralperk.co.id', personalEmail: 'anita.wijaya89@gmail.com', phone: '+62 812-2200-3010', additionalPhone: '+62 811-2200-3011',
    dateOfBirth: '1989-09-03', placeOfBirth: 'Bandung', maritalStatus: 'Married', religion: 'Katolik',
    passportNo: 'A2345678', passportExpiry: '2028-11-14', passportCountry: 'Indonesia',
    nik: '3273034309890002', npwp: '08.112.334.5-012.000', ptkpStatus: 'K/1',
    directManager: 'Rizal Candra', basicSalary: 32_000_000,
    bankAccountNumber: '7730081245', bankAccountHolder: 'Anita Wijaya',
    bpjsKesehatanNo: '0002234567802', bpjsKetenagakerjaanNo: '19060023456',
    ktpAddress: 'Jl. Cihampelas No. 45, Bandung', currentAddress: 'Apartemen Setiabudi Tower A/12-05, Bandung',
    emergencyName: 'Michael Tanujaya', emergencyRelationship: 'Spouse', emergencyPhone: '+62 812-3400-5566',
    lastEducation: 'S2', major: 'Accounting', institution: 'Universitas Padjadjaran',
    family: [
      { id: 'fam-0002-1', name: 'Michael Tanujaya', relationship: 'Spouse', birthDate: '1986-05-11', citizenId: '3273031105860005', maritalStatus: 'Married', gender: 'Male',   occupation: 'Architect', religion: 'Katolik', reimbursementEligible: true },
      { id: 'fam-0002-2', name: 'Gabriel Tanujaya', relationship: 'Child',  birthDate: '2016-09-22', citizenId: '3273032209160006', maritalStatus: 'Single',  gender: 'Male',   occupation: 'Student',   religion: 'Katolik', reimbursementEligible: true },
    ],
    emergencyContacts: [
      { id: 'ec-0002-1', name: 'Michael Tanujaya', relationship: 'Spouse',  phone: '+62 812-3400-5566' },
      { id: 'ec-0002-2', name: 'Lisa Wijaya',      relationship: 'Sibling', phone: '+62 813-7788-1234' },
    ],
    education: [
      { id: 'edu-0002-1', institution: 'Universitas Indonesia',  degree: "Master's degree (S2)",   fieldOfStudy: 'Accounting', startYear: '2012', endYear: '2014', grade: '3.85 / 4.00', certificateUrl: '/avatars/cinta.jpg' },
      { id: 'edu-0002-2', institution: 'Universitas Padjadjaran', degree: "Bachelor's degree (S1)", fieldOfStudy: 'Accounting', startYear: '2007', endYear: '2011', grade: '3.62 / 4.00' },
      { id: 'edu-0002-3', institution: 'SMA Negeri 3 Bandung',    degree: 'High school',            fieldOfStudy: 'Science',    startYear: '2004', endYear: '2007', grade: '—' },
    ],
    workExperience: [
      { id: 'we-0002-1', company: 'KAP Tanudiredja & Rekan', position: 'Senior Auditor',      startYear: '2014', endYear: '2019' },
      { id: 'we-0002-2', company: 'PT Astra Financial',      position: 'Finance Analyst',      startYear: '2012', endYear: '2014' },
    ],
  }),
  emp({
    employeeId: 'EMP-0003', fullName: 'Budi Santoso', gender: 'Male',
    jobPosition: 'Warehouse Supervisor', department: 'Warehouse', jobLevel: 'Staff',
    businessUnit: 'Wholesale', employmentStatus: 'Permanent', joinDate: '2020-01-20', branch: 'Gudang Bandung Selatan',
    email: 'budi.santoso@centralperk.co.id', personalEmail: 'budisantoso91@gmail.com', phone: '+62 813-4400-5521', additionalPhone: '+62 812-4400-5522',
    dateOfBirth: '1991-11-22', placeOfBirth: 'Semarang', maritalStatus: 'Married',
    nik: '3374012211910003', npwp: '07.223.445.6-503.000', ptkpStatus: 'K/2',
    directManager: 'Rizal Candra', basicSalary: 9_500_000, overtimeEligible: true,
    bankAccountNumber: '1440221190', bankAccountHolder: 'Budi Santoso',
    bpjsKesehatanNo: '0003234567803', bpjsKetenagakerjaanNo: '20010034567',
    ktpAddress: 'Jl. Pahlawan No. 8, Semarang', currentAddress: 'Jl. Soekarno-Hatta No. 210, Bandung',
    emergencyName: 'Wulan Santoso', emergencyRelationship: 'Spouse', emergencyPhone: '+62 813-6600-7788',
    lastEducation: 'D3', major: 'Logistics Management', institution: 'Universitas Diponegoro',
    family: [
      { id: 'fam-0003-1', name: 'Wulan Santoso',  relationship: 'Spouse', birthDate: '1993-02-14', citizenId: '3374011402930007', maritalStatus: 'Married', gender: 'Female', occupation: 'Homemaker', religion: 'Islam', reimbursementEligible: true },
      { id: 'fam-0003-2', name: 'Arka Santoso',   relationship: 'Child',  birthDate: '2018-06-30', citizenId: '3374013006180008', maritalStatus: 'Single',  gender: 'Male',   occupation: 'Student',   religion: 'Islam', reimbursementEligible: true },
      { id: 'fam-0003-3', name: 'Naya Santoso',   relationship: 'Child',  birthDate: '2021-12-02', citizenId: '3374010212210009', maritalStatus: 'Single',  gender: 'Female', occupation: '—',         religion: 'Islam', reimbursementEligible: true },
    ],
    emergencyContacts: [
      { id: 'ec-0003-1', name: 'Wulan Santoso', relationship: 'Spouse', phone: '+62 813-6600-7788' },
      { id: 'ec-0003-2', name: 'Slamet Santoso', relationship: 'Parent', phone: '+62 812-1010-2020' },
    ],
    education: [
      { id: 'edu-0003-1', institution: 'Universitas Diponegoro', degree: 'Associate degree (D3)',   fieldOfStudy: 'Logistics Management',  startYear: '2009', endYear: '2012', grade: '3.40 / 4.00', certificateUrl: '/avatars/ali.jpg' },
      { id: 'edu-0003-2', institution: 'SMK Negeri 7 Semarang',  degree: 'Vocational high school',  fieldOfStudy: 'Mechanical Engineering', startYear: '2006', endYear: '2009', grade: '—' },
    ],
    workExperience: [
      { id: 'we-0003-1', company: 'PT Sinar Logistik', position: 'Warehouse Staff', startYear: '2015', endYear: '2019' },
    ],
  }),
  emp({
    employeeId: 'EMP-0004', fullName: 'Siti Rahmawati', gender: 'Female',
    jobPosition: 'Head Barista', department: 'Operations', jobLevel: 'Staff',
    businessUnit: 'Retail Coffee', employmentStatus: 'Permanent', joinDate: '2021-03-08',
    email: 'siti.rahmawati@centralperk.co.id', personalEmail: 'sitirahma94@gmail.com', phone: '+62 812-7788-6600', additionalPhone: '+62 813-7788-6601',
    dateOfBirth: '1994-07-15', placeOfBirth: 'Yogyakarta', maritalStatus: 'Single',
    nik: '3471071507940004', npwp: '06.334.556.7-541.000', ptkpStatus: 'TK/0',
    directManager: 'Rizal Candra', basicSalary: 7_800_000, overtimeEligible: true,
    bankAccountNumber: '8801223344', bankAccountHolder: 'Siti Rahmawati',
    bpjsKesehatanNo: '0004234567804', bpjsKetenagakerjaanNo: '21030045678',
    ktpAddress: 'Jl. Malioboro No. 88, Yogyakarta', currentAddress: 'Jl. Kaliurang KM 5 No. 21, Sleman',
    emergencyName: 'Suryanto', emergencyRelationship: 'Parent', emergencyPhone: '+62 812-5050-6060',
    lastEducation: 'SMA/SMK', major: 'F&B Service', institution: 'SMK Negeri 6 Yogyakarta',
    status: 'resigning', resignDate: '2026-09-20',
    family: [
      { id: 'fam-0004-1', name: 'Suryanto',        relationship: 'Parent', birthDate: '1965-03-01', citizenId: '3471070103650010', maritalStatus: 'Married', gender: 'Male',   occupation: 'Retired',  religion: 'Islam', reimbursementEligible: false },
      { id: 'fam-0004-2', name: 'Endang Suryani',  relationship: 'Parent', birthDate: '1968-10-19', citizenId: '3471071910680011', maritalStatus: 'Married', gender: 'Female', occupation: 'Homemaker', religion: 'Islam', reimbursementEligible: false },
    ],
    emergencyContacts: [
      { id: 'ec-0004-1', name: 'Suryanto',       relationship: 'Parent',  phone: '+62 812-5050-6060' },
      { id: 'ec-0004-2', name: 'Rahmat Hidayat', relationship: 'Sibling', phone: '+62 813-9090-8080' },
    ],
    education: [
      { id: 'edu-0004-1', institution: 'SMK Negeri 6 Yogyakarta', degree: 'Vocational high school', fieldOfStudy: 'Food & Beverage Service', startYear: '2009', endYear: '2012', grade: '8.4 / 10', certificateUrl: '/avatars/indah.jpg' },
      { id: 'edu-0004-2', institution: 'SMP Negeri 5 Yogyakarta', degree: 'Junior high school',    fieldOfStudy: 'General',                 startYear: '2006', endYear: '2009', grade: '—' },
    ],
    workExperience: [
      { id: 'we-0004-1', company: 'Kopi Klotok', position: 'Barista', startYear: '2018', endYear: '2021' },
    ],
  }),
  emp({
    employeeId: 'EMP-0005', fullName: 'Dewi Lestari', gender: 'Female',
    jobPosition: 'Marketing Lead', department: 'Marketing', jobLevel: 'Manager',
    businessUnit: 'Retail Coffee', employmentStatus: 'Permanent', joinDate: '2019-11-04',
    email: 'dewi.lestari@centralperk.co.id', personalEmail: 'dewilestari90@gmail.com', phone: '+62 811-5566-7788', additionalPhone: '+62 812-5566-7789',
    dateOfBirth: '1990-02-28', placeOfBirth: 'Surabaya', maritalStatus: 'Married', religion: 'Hindu', branch: 'Gudang Surabaya Timur',
    passportNo: 'B3456789', passportExpiry: '2030-01-20', passportCountry: 'Indonesia',
    nik: '3578012802900005', npwp: '05.445.667.8-606.000', ptkpStatus: 'K/1',
    directManager: 'Rizal Candra', basicSalary: 28_000_000,
    bankAccountNumber: '2201338890', bankAccountHolder: 'Dewi Lestari',
    bpjsKesehatanNo: '0005234567805', bpjsKetenagakerjaanNo: '19110056789',
    ktpAddress: 'Jl. Darmo Permai No. 30, Surabaya', currentAddress: 'Jl. Darmo Permai No. 30, Surabaya',
    emergencyName: 'Ketut Arya', emergencyRelationship: 'Spouse', emergencyPhone: '+62 812-8899-1100',
    lastEducation: 'S1', major: 'Communications', institution: 'Universitas Airlangga',
    family: [
      { id: 'fam-0005-1', name: 'Ketut Arya',   relationship: 'Spouse', birthDate: '1988-07-07', citizenId: '3578010707880012', maritalStatus: 'Married', gender: 'Male',   occupation: 'Graphic Designer', religion: 'Hindu', reimbursementEligible: true },
      { id: 'fam-0005-2', name: 'Kadek Ayu',    relationship: 'Child',  birthDate: '2019-04-18', citizenId: '3578011804190013', maritalStatus: 'Single',  gender: 'Female', occupation: 'Student',          religion: 'Hindu', reimbursementEligible: true },
    ],
    emergencyContacts: [
      { id: 'ec-0005-1', name: 'Ketut Arya',   relationship: 'Spouse',  phone: '+62 812-8899-1100' },
      { id: 'ec-0005-2', name: 'Sri Lestari',  relationship: 'Parent',  phone: '+62 813-2233-4455' },
    ],
    education: [
      { id: 'edu-0005-1', institution: 'Universitas Airlangga', degree: "Bachelor's degree (S1)", fieldOfStudy: 'Communications',  startYear: '2008', endYear: '2012', grade: '3.55 / 4.00', certificateUrl: '/avatars/jessie.jpg' },
      { id: 'edu-0005-2', institution: 'SMA Negeri 5 Surabaya', degree: 'High school',            fieldOfStudy: 'Social Science', startYear: '2005', endYear: '2008', grade: '—' },
    ],
    workExperience: [
      { id: 'we-0005-1', company: 'PT Unilever Indonesia', position: 'Brand Executive',   startYear: '2015', endYear: '2019' },
      { id: 'we-0005-2', company: 'Ogilvy Indonesia',      position: 'Account Executive', startYear: '2013', endYear: '2015' },
    ],
  }),
  emp({
    employeeId: 'EMP-0006', fullName: 'Agus Pratama', gender: 'Male',
    jobPosition: 'Production Supervisor', department: 'Production', jobLevel: 'Staff',
    businessUnit: 'Wholesale', employmentStatus: 'Permanent', joinDate: '2020-08-11', branch: 'Gudang Bandung Selatan',
    email: 'agus.pratama@centralperk.co.id', personalEmail: 'aguspratama88@gmail.com', phone: '+62 813-1122-3344', additionalPhone: '+62 812-1122-3345',
    dateOfBirth: '1988-12-01', placeOfBirth: 'Malang', maritalStatus: 'Married',
    nik: '3573010112880006', npwp: '04.556.778.9-651.000', ptkpStatus: 'K/2',
    directManager: 'Rizal Candra', basicSalary: 11_200_000, overtimeEligible: true,
    bankAccountNumber: '3312449901', bankAccountHolder: 'Agus Pratama',
    bpjsKesehatanNo: '0006234567806', bpjsKetenagakerjaanNo: '20080067890',
    ktpAddress: 'Jl. Ijen No. 15, Malang', currentAddress: 'Jl. Kopo No. 112, Bandung',
    emergencyName: 'Rina Pratama', emergencyRelationship: 'Spouse', emergencyPhone: '+62 813-3344-5566',
    lastEducation: 'S1', major: 'Food Technology', institution: 'Universitas Brawijaya',
    family: [
      { id: 'fam-0006-1', name: 'Rina Pratama',  relationship: 'Spouse', birthDate: '1990-01-25', citizenId: '3573012501900014', maritalStatus: 'Married', gender: 'Female', occupation: 'Teacher',  religion: 'Islam', reimbursementEligible: true },
      { id: 'fam-0006-2', name: 'Fauzan Pratama', relationship: 'Child', birthDate: '2015-08-09', citizenId: '3573010908150015', maritalStatus: 'Single',  gender: 'Male',   occupation: 'Student', religion: 'Islam', reimbursementEligible: true },
      { id: 'fam-0006-3', name: 'Aisyah Pratama', relationship: 'Child', birthDate: '2019-03-17', citizenId: '3573011703190016', maritalStatus: 'Single',  gender: 'Female', occupation: 'Student', religion: 'Islam', reimbursementEligible: true },
    ],
    emergencyContacts: [
      { id: 'ec-0006-1', name: 'Rina Pratama', relationship: 'Spouse', phone: '+62 813-3344-5566' },
    ],
    education: [
      { id: 'edu-0006-1', institution: 'Universitas Brawijaya', degree: "Bachelor's degree (S1)", fieldOfStudy: 'Food Technology', startYear: '2006', endYear: '2010', grade: '3.48 / 4.00', certificateUrl: '/avatars/daud.jpg' },
      { id: 'edu-0006-2', institution: 'SMA Negeri 1 Malang',   degree: 'High school',            fieldOfStudy: 'Science',         startYear: '2003', endYear: '2006', grade: '—' },
    ],
    workExperience: [
      { id: 'we-0006-1', company: 'PT Nestlé Indonesia', position: 'Production Operator', startYear: '2012', endYear: '2020' },
    ],
  }),
  emp({
    employeeId: 'EMP-0007', fullName: 'Putri Ayu', gender: 'Female',
    jobPosition: 'People Operations Specialist', department: 'People', jobLevel: 'Staff',
    businessUnit: 'Corporate', employmentStatus: 'Permanent', joinDate: '2022-02-14',
    email: 'putri.ayu@centralperk.co.id', personalEmail: 'putriayu96@gmail.com', phone: '+62 812-9988-1010', additionalPhone: '+62 813-9988-1011',
    dateOfBirth: '1996-05-19', placeOfBirth: 'Jakarta', maritalStatus: 'Single',
    nik: '3171051905960007', npwp: '03.667.889.0-011.000', ptkpStatus: 'TK/0',
    directManager: 'Anita Wijaya', basicSalary: 8_500_000,
    bankAccountNumber: '5590112233', bankAccountHolder: 'Putri Ayu',
    bpjsKesehatanNo: '0007234567807', bpjsKetenagakerjaanNo: '22020078901',
    ktpAddress: 'Jl. Tebet Timur No. 22, Jakarta Selatan', currentAddress: 'Jl. Tebet Timur No. 22, Jakarta Selatan',
    emergencyName: 'Hendra Wibowo', emergencyRelationship: 'Parent', emergencyPhone: '+62 812-4321-9876',
    lastEducation: 'S1', major: 'Psychology', institution: 'Universitas Gadjah Mada',
    status: 'resigning', resignDate: '2026-09-05',
    family: [
      { id: 'fam-0007-1', name: 'Hendra Wibowo', relationship: 'Parent', birthDate: '1967-09-12', citizenId: '3171051209670017', maritalStatus: 'Married', gender: 'Male',   occupation: 'Civil Servant', religion: 'Islam', reimbursementEligible: false },
      { id: 'fam-0007-2', name: 'Sulastri',      relationship: 'Parent', birthDate: '1970-06-28', citizenId: '3171052806700018', maritalStatus: 'Married', gender: 'Female', occupation: 'Homemaker',    religion: 'Islam', reimbursementEligible: false },
    ],
    emergencyContacts: [
      { id: 'ec-0007-1', name: 'Hendra Wibowo', relationship: 'Parent',  phone: '+62 812-4321-9876' },
      { id: 'ec-0007-2', name: 'Dimas Wibowo',  relationship: 'Sibling', phone: '+62 813-5678-1234' },
    ],
    education: [
      { id: 'edu-0007-1', institution: 'Universitas Gadjah Mada', degree: "Bachelor's degree (S1)", fieldOfStudy: 'Psychology',     startYear: '2014', endYear: '2018', grade: '3.70 / 4.00', certificateUrl: '/avatars/cinta.jpg' },
      { id: 'edu-0007-2', institution: 'SMA Negeri 8 Jakarta',    degree: 'High school',            fieldOfStudy: 'Social Science', startYear: '2011', endYear: '2014', grade: '—' },
    ],
    workExperience: [
      { id: 'we-0007-1', company: 'PT Tokopedia', position: 'HR Intern', startYear: '2020', endYear: '2021' },
    ],
  }),
  emp({
    employeeId: 'EMP-0008', fullName: 'Rio Firmansyah', gender: 'Male',
    jobPosition: 'Backend Engineer', department: 'Technology', jobLevel: 'Staff',
    businessUnit: 'Corporate', employmentStatus: 'Permanent', joinDate: '2021-09-27',
    email: 'rio.firmansyah@centralperk.co.id', personalEmail: 'rio.firmansyah93@gmail.com', phone: '+62 811-3030-4040', additionalPhone: '+62 812-3030-4041',
    dateOfBirth: '1993-03-30', placeOfBirth: 'Bekasi', maritalStatus: 'Single',
    nik: '3275013003930008', npwp: '02.778.990.1-407.000', ptkpStatus: 'TK/0',
    directManager: 'Rizal Candra', basicSalary: 18_500_000,
    bankAccountNumber: '6601223344', bankAccountHolder: 'Rio Firmansyah',
    bpjsKesehatanNo: '0008234567808', bpjsKetenagakerjaanNo: '21090089012',
    ktpAddress: 'Jl. Ahmad Yani No. 40, Bekasi', currentAddress: 'Jl. Casablanca Raya No. 5, Jakarta Selatan',
    emergencyName: 'Bambang Firmansyah', emergencyRelationship: 'Parent', emergencyPhone: '+62 812-7654-3210',
    lastEducation: 'S1', major: 'Informatics', institution: 'Institut Teknologi Bandung',
    family: [
      { id: 'fam-0008-1', name: 'Bambang Firmansyah', relationship: 'Parent', birthDate: '1964-11-04', citizenId: '3275010411640019', maritalStatus: 'Married', gender: 'Male',   occupation: 'Retired',   religion: 'Islam', reimbursementEligible: false },
      { id: 'fam-0008-2', name: 'Yanti Firmansyah',   relationship: 'Parent', birthDate: '1967-02-16', citizenId: '3275011602670020', maritalStatus: 'Married', gender: 'Female', occupation: 'Homemaker', religion: 'Islam', reimbursementEligible: false },
    ],
    emergencyContacts: [
      { id: 'ec-0008-1', name: 'Bambang Firmansyah', relationship: 'Parent',  phone: '+62 812-7654-3210' },
      { id: 'ec-0008-2', name: 'Rani Firmansyah',    relationship: 'Sibling', phone: '+62 813-1212-9090' },
    ],
    education: [
      { id: 'edu-0008-1', institution: 'Institut Teknologi Bandung', degree: "Bachelor's degree (S1)", fieldOfStudy: 'Informatics', startYear: '2011', endYear: '2015', grade: '3.66 / 4.00', certificateUrl: '/avatars/fajar.jpg' },
      { id: 'edu-0008-2', institution: 'SMA Negeri 2 Bekasi',        degree: 'High school',            fieldOfStudy: 'Science',     startYear: '2008', endYear: '2011', grade: '—' },
    ],
    workExperience: [
      { id: 'we-0008-1', company: 'Gojek', position: 'Software Engineer',        startYear: '2018', endYear: '2021' },
      { id: 'we-0008-2', company: 'Bukalapak', position: 'Junior Backend Engineer', startYear: '2016', endYear: '2018' },
    ],
  }),
  emp({
    employeeId: 'EMP-0009', fullName: 'Maya Kusuma', gender: 'Female',
    jobPosition: 'Accountant', department: 'Finance', jobLevel: 'Staff',
    businessUnit: 'Corporate', employmentStatus: 'Permanent', joinDate: '2022-07-05',
    email: 'maya.kusuma@centralperk.co.id', personalEmail: 'mayakusuma95@gmail.com', phone: '+62 812-6060-7070', additionalPhone: '+62 813-6060-7071',
    dateOfBirth: '1995-10-10', placeOfBirth: 'Bandung', maritalStatus: 'Single', branch: 'Gudang Bandung Selatan',
    nik: '3273011010950009', npwp: '01.889.001.2-424.000', ptkpStatus: 'TK/0',
    directManager: 'Anita Wijaya', basicSalary: 9_800_000,
    bankAccountNumber: '7712334455', bankAccountHolder: 'Maya Kusuma',
    bpjsKesehatanNo: '0009234567809', bpjsKetenagakerjaanNo: '22070090123',
    ktpAddress: 'Jl. Dago No. 100, Bandung', currentAddress: 'Jl. Dago No. 100, Bandung',
    emergencyName: 'Tono Kusuma', emergencyRelationship: 'Parent', emergencyPhone: '+62 812-3131-4141',
    lastEducation: 'S1', major: 'Accounting', institution: 'Universitas Padjadjaran',
    family: [
      { id: 'fam-0009-1', name: 'Tono Kusuma',   relationship: 'Parent', birthDate: '1966-08-05', citizenId: '3273010508660021', maritalStatus: 'Married', gender: 'Male',   occupation: 'Entrepreneur', religion: 'Islam', reimbursementEligible: false },
      { id: 'fam-0009-2', name: 'Ratih Kusuma',  relationship: 'Parent', birthDate: '1969-12-11', citizenId: '3273011112690022', maritalStatus: 'Married', gender: 'Female', occupation: 'Homemaker',    religion: 'Islam', reimbursementEligible: false },
    ],
    emergencyContacts: [
      { id: 'ec-0009-1', name: 'Tono Kusuma', relationship: 'Parent', phone: '+62 812-3131-4141' },
    ],
    education: [
      { id: 'edu-0009-1', institution: 'Universitas Padjadjaran', degree: "Bachelor's degree (S1)", fieldOfStudy: 'Accounting',     startYear: '2013', endYear: '2017', grade: '3.58 / 4.00', certificateUrl: '/avatars/indah.jpg' },
      { id: 'edu-0009-2', institution: 'SMA Negeri 3 Bandung',    degree: 'High school',            fieldOfStudy: 'Social Science', startYear: '2010', endYear: '2013', grade: '—' },
    ],
    workExperience: [
      { id: 'we-0009-1', company: 'KAP Purwantono', position: 'Junior Accountant', startYear: '2019', endYear: '2022' },
    ],
  }),
  emp({
    employeeId: 'EMP-0010', fullName: 'Fajar Nugroho', gender: 'Male',
    jobPosition: 'Sales Executive', department: 'Sales', jobLevel: 'Staff',
    businessUnit: 'Wholesale', employmentStatus: 'Contract', joinDate: '2023-04-03', contractEndDate: '2026-04-02',
    email: 'fajar.nugroho@centralperk.co.id', personalEmail: 'fajarnugroho97@gmail.com', phone: '+62 813-8080-9090', additionalPhone: '+62 812-8080-9091',
    dateOfBirth: '1997-01-25', placeOfBirth: 'Solo', maritalStatus: 'Single',
    nik: '3372012501970010', npwp: '11.990.112.3-526.000', ptkpStatus: 'TK/0',
    directManager: 'Dewi Lestari', basicSalary: 8_000_000, overtimeEligible: true,
    bankAccountNumber: '8823445566', bankAccountHolder: 'Fajar Nugroho',
    bpjsKesehatanNo: '0010234567810', bpjsKetenagakerjaanNo: '23040001234',
    ktpAddress: 'Jl. Slamet Riyadi No. 77, Surakarta', currentAddress: 'Jl. Diponegoro No. 18, Surabaya',
    emergencyName: 'Sri Nugroho', emergencyRelationship: 'Parent', emergencyPhone: '+62 812-9191-8181',
    lastEducation: 'S1', major: 'Marketing', institution: 'Universitas Sebelas Maret',
    family: [
      { id: 'fam-0010-1', name: 'Sri Nugroho', relationship: 'Parent', birthDate: '1968-04-22', citizenId: '3372012204680023', maritalStatus: 'Married', gender: 'Female', occupation: 'Trader', religion: 'Islam', reimbursementEligible: false },
    ],
    emergencyContacts: [
      { id: 'ec-0010-1', name: 'Sri Nugroho',   relationship: 'Parent',  phone: '+62 812-9191-8181' },
      { id: 'ec-0010-2', name: 'Andi Nugroho',  relationship: 'Sibling', phone: '+62 813-2828-3838' },
    ],
    education: [
      { id: 'edu-0010-1', institution: 'Universitas Sebelas Maret', degree: "Bachelor's degree (S1)", fieldOfStudy: 'Marketing',      startYear: '2015', endYear: '2019', grade: '3.44 / 4.00', certificateUrl: '/avatars/joko.jpg' },
      { id: 'edu-0010-2', institution: 'SMA Negeri 4 Surakarta',    degree: 'High school',            fieldOfStudy: 'Social Science', startYear: '2012', endYear: '2015', grade: '—' },
    ],
    workExperience: [
      { id: 'we-0010-1', company: 'PT Sinar Sosro', position: 'Sales Representative', startYear: '2020', endYear: '2023' },
    ],
  }),
  emp({
    employeeId: 'EMP-0011', fullName: 'Indah Permatasari', gender: 'Female',
    jobPosition: 'Barista', department: 'Operations', jobLevel: 'Staff',
    businessUnit: 'Retail Coffee', employmentStatus: 'Probation', joinDate: '2026-06-15',
    email: 'indah.permatasari@centralperk.co.id', personalEmail: 'indahpermata00@gmail.com', phone: '+62 812-1212-3434', additionalPhone: '+62 813-1212-3435',
    dateOfBirth: '2000-08-08', placeOfBirth: 'Depok', maritalStatus: 'Single',
    nik: '3276010808000011', npwp: '12.001.223.4-412.000', ptkpStatus: 'TK/0',
    directManager: 'Siti Rahmawati', basicSalary: 6_200_000, overtimeEligible: true,
    bankAccountNumber: '9934556677', bankAccountHolder: 'Indah Permatasari',
    bpjsKesehatanNo: '0011234567811', bpjsKetenagakerjaanNo: '26060012345',
    ktpAddress: 'Jl. Margonda Raya No. 55, Depok', currentAddress: 'Jl. Margonda Raya No. 55, Depok',
    emergencyName: 'Warto', emergencyRelationship: 'Parent', emergencyPhone: '+62 812-6767-5454',
    lastEducation: 'SMA/SMK', major: 'F&B Service', institution: 'SMK Negeri 2 Depok',
    family: [
      { id: 'fam-0011-1', name: 'Warto',      relationship: 'Parent', birthDate: '1972-01-30', citizenId: '3276013001720024', maritalStatus: 'Married', gender: 'Male',   occupation: 'Driver',    religion: 'Islam', reimbursementEligible: false },
      { id: 'fam-0011-2', name: 'Yuliana',    relationship: 'Parent', birthDate: '1975-07-14', citizenId: '3276011407750025', maritalStatus: 'Married', gender: 'Female', occupation: 'Homemaker', religion: 'Islam', reimbursementEligible: false },
    ],
    emergencyContacts: [
      { id: 'ec-0011-1', name: 'Warto',   relationship: 'Parent', phone: '+62 812-6767-5454' },
    ],
    education: [
      { id: 'edu-0011-1', institution: 'SMK Negeri 2 Depok', degree: 'Vocational high school', fieldOfStudy: 'Food & Beverage Service', startYear: '2015', endYear: '2018', grade: '8.6 / 10', certificateUrl: '/avatars/christin.jpg' },
      { id: 'edu-0011-2', institution: 'SMP Negeri 3 Depok', degree: 'Junior high school',    fieldOfStudy: 'General',                 startYear: '2012', endYear: '2015', grade: '—' },
    ],
    workExperience: [
      { id: 'we-0011-1', company: 'Janji Jiwa', position: 'Barista Trainee', startYear: '2025', endYear: '2026' },
    ],
  }),
  emp({
    employeeId: 'EMP-0012', fullName: 'Hendra Gunawan', gender: 'Male',
    jobPosition: 'Logistics Coordinator', department: 'Warehouse', jobLevel: 'Staff',
    businessUnit: 'Wholesale', employmentStatus: 'Permanent', joinDate: '2020-05-18', branch: 'Gudang Surabaya Timur',
    email: 'hendra.gunawan@centralperk.co.id', personalEmail: 'hendragunawan90@gmail.com', phone: '+62 811-4545-5656', additionalPhone: '+62 812-4545-5657',
    dateOfBirth: '1990-06-06', placeOfBirth: 'Surabaya', maritalStatus: 'Married',
    nik: '3578010606900012', npwp: '13.112.334.5-616.000', ptkpStatus: 'K/1',
    directManager: 'Budi Santoso', basicSalary: 9_000_000, overtimeEligible: true,
    bankAccountNumber: '1045667788', bankAccountHolder: 'Hendra Gunawan',
    bpjsKesehatanNo: '0012234567812', bpjsKetenagakerjaanNo: '20050023456',
    ktpAddress: 'Jl. Rungkut Industri No. 12, Surabaya', currentAddress: 'Jl. Rungkut Industri No. 12, Surabaya',
    emergencyName: 'Melati Gunawan', emergencyRelationship: 'Spouse', emergencyPhone: '+62 813-4646-5757',
    lastEducation: 'D3', major: 'Logistics', institution: 'Politeknik Perkapalan Negeri Surabaya',
    family: [
      { id: 'fam-0012-1', name: 'Melati Gunawan', relationship: 'Spouse', birthDate: '1992-09-09', citizenId: '3578010909920026', maritalStatus: 'Married', gender: 'Female', occupation: 'Nurse',   religion: 'Islam', reimbursementEligible: true },
      { id: 'fam-0012-2', name: 'Bagas Gunawan',  relationship: 'Child',  birthDate: '2020-02-20', citizenId: '3578012002200027', maritalStatus: 'Single',  gender: 'Male',   occupation: '—',       religion: 'Islam', reimbursementEligible: true },
    ],
    emergencyContacts: [
      { id: 'ec-0012-1', name: 'Melati Gunawan', relationship: 'Spouse', phone: '+62 813-4646-5757' },
    ],
    education: [
      { id: 'edu-0012-1', institution: 'Politeknik Perkapalan Negeri Surabaya', degree: 'Associate degree (D3)', fieldOfStudy: 'Logistics', startYear: '2008', endYear: '2011', grade: '3.35 / 4.00', certificateUrl: '/avatars/rizal.jpg' },
      { id: 'edu-0012-2', institution: 'SMA Negeri 6 Surabaya',                  degree: 'High school',          fieldOfStudy: 'Science',   startYear: '2005', endYear: '2008', grade: '—' },
    ],
    workExperience: [
      { id: 'we-0012-1', company: 'PT Pelindo Marine', position: 'Logistics Staff', startYear: '2014', endYear: '2020' },
    ],
  }),
  emp({
    employeeId: 'EMP-0013', fullName: 'Clara Tanuwijaya', gender: 'Female',
    jobPosition: 'Store Manager — Bali', department: 'Operations', jobLevel: 'Manager',
    businessUnit: 'Retail Coffee', employmentStatus: 'Permanent', joinDate: '2019-03-22', branch: 'Gudang Bali Kuta',
    email: 'clara.t@centralperk.co.id', personalEmail: 'claratanu88@gmail.com', phone: '+62 812-7676-8787', additionalPhone: '+62 813-7676-8788',
    dateOfBirth: '1988-04-04', placeOfBirth: 'Denpasar', maritalStatus: 'Married', religion: 'Kristen Protestan',
    passportNo: 'C4567890', passportExpiry: '2029-09-09', passportCountry: 'Indonesia',
    nik: '5171010404880013', npwp: '14.223.445.6-901.000', ptkpStatus: 'K/2',
    directManager: 'Rizal Candra', basicSalary: 24_000_000,
    bankAccountNumber: '2156778899', bankAccountHolder: 'Clara Tanuwijaya',
    bpjsKesehatanNo: '0013234567813', bpjsKetenagakerjaanNo: '19030034567',
    ktpAddress: 'Jl. Sunset Road No. 66, Kuta, Bali', currentAddress: 'Jl. Sunset Road No. 66, Kuta, Bali',
    emergencyName: 'David Tanuwijaya', emergencyRelationship: 'Spouse', emergencyPhone: '+62 812-1717-2828',
    lastEducation: 'S1', major: 'Hospitality Management', institution: 'Universitas Udayana',
    family: [
      { id: 'fam-0013-1', name: 'David Tanuwijaya', relationship: 'Spouse', birthDate: '1985-06-15', citizenId: '5171011506850028', maritalStatus: 'Married', gender: 'Male',   occupation: 'Hotel Manager', religion: 'Kristen Protestan', reimbursementEligible: true },
      { id: 'fam-0013-2', name: 'Nathan Tanuwijaya', relationship: 'Child', birthDate: '2013-10-01', citizenId: '5171010110130029', maritalStatus: 'Single', gender: 'Male',   occupation: 'Student',      religion: 'Kristen Protestan', reimbursementEligible: true },
      { id: 'fam-0013-3', name: 'Chloe Tanuwijaya',  relationship: 'Child', birthDate: '2016-05-23', citizenId: '5171012305160030', maritalStatus: 'Single', gender: 'Female', occupation: 'Student',      religion: 'Kristen Protestan', reimbursementEligible: true },
    ],
    emergencyContacts: [
      { id: 'ec-0013-1', name: 'David Tanuwijaya', relationship: 'Spouse', phone: '+62 812-1717-2828' },
      { id: 'ec-0013-2', name: 'Grace Halim',      relationship: 'Sibling', phone: '+62 813-9494-8585' },
    ],
    education: [
      { id: 'edu-0013-1', institution: 'Universitas Udayana',   degree: "Bachelor's degree (S1)", fieldOfStudy: 'Hospitality Management', startYear: '2006', endYear: '2010', grade: '3.62 / 4.00', certificateUrl: '/avatars/evelyn.jpg' },
      { id: 'edu-0013-2', institution: 'SMA Negeri 1 Denpasar', degree: 'High school',            fieldOfStudy: 'Social Science',         startYear: '2003', endYear: '2006', grade: '—' },
    ],
    workExperience: [
      { id: 'we-0013-1', company: 'The Ritz-Carlton Bali', position: 'F&B Supervisor',  startYear: '2012', endYear: '2019' },
      { id: 'we-0013-2', company: 'Starbucks Indonesia',   position: 'Shift Supervisor', startYear: '2010', endYear: '2012' },
    ],
  }),
  emp({
    employeeId: 'EMP-0014', fullName: 'Yoga Saputra', gender: 'Male',
    jobPosition: 'Roaster', department: 'Production', jobLevel: 'Staff',
    businessUnit: 'Wholesale', employmentStatus: 'Part-time', joinDate: '2023-10-09', branch: 'Gudang Bandung Selatan',
    email: 'yoga.saputra@centralperk.co.id', personalEmail: 'yogasaputra98@gmail.com', phone: '+62 813-9797-6565', additionalPhone: '+62 812-9797-6566',
    dateOfBirth: '1998-09-14', placeOfBirth: 'Cimahi', maritalStatus: 'Single',
    nik: '3277011409980014', npwp: '15.334.556.7-421.000', ptkpStatus: 'TK/0',
    directManager: 'Agus Pratama', basicSalary: 5_500_000, salaryType: 'Daily', overtimeEligible: true,
    bankAccountNumber: '3367889900', bankAccountHolder: 'Yoga Saputra',
    bpjsKesehatanNo: '0014234567814', bpjsKetenagakerjaanNo: '23100045678',
    ktpAddress: 'Jl. Amir Machmud No. 20, Cimahi', currentAddress: 'Jl. Kopo No. 118, Bandung',
    emergencyName: 'Dedi Saputra', emergencyRelationship: 'Parent', emergencyPhone: '+62 812-5353-6464',
    lastEducation: 'D3', major: 'Agribusiness', institution: 'Politeknik Negeri Bandung',
    family: [
      { id: 'fam-0014-1', name: 'Dedi Saputra', relationship: 'Parent', birthDate: '1970-11-11', citizenId: '3277011111700031', maritalStatus: 'Married', gender: 'Male',   occupation: 'Farmer',    religion: 'Islam', reimbursementEligible: false },
      { id: 'fam-0014-2', name: 'Nining',       relationship: 'Parent', birthDate: '1973-03-03', citizenId: '3277010303730032', maritalStatus: 'Married', gender: 'Female', occupation: 'Homemaker', religion: 'Islam', reimbursementEligible: false },
    ],
    emergencyContacts: [
      { id: 'ec-0014-1', name: 'Dedi Saputra', relationship: 'Parent', phone: '+62 812-5353-6464' },
    ],
    education: [
      { id: 'edu-0014-1', institution: 'Politeknik Negeri Bandung', degree: 'Associate degree (D3)',  fieldOfStudy: 'Agribusiness', startYear: '2016', endYear: '2019', grade: '3.30 / 4.00', certificateUrl: '/avatars/alfian.jpg' },
      { id: 'edu-0014-2', institution: 'SMK Negeri 1 Cimahi',       degree: 'Vocational high school', fieldOfStudy: 'Agriculture', startYear: '2013', endYear: '2016', grade: '—' },
    ],
    workExperience: [
      { id: 'we-0014-1', company: 'Kopi Aroma Bandung', position: 'Roasting Assistant', startYear: '2021', endYear: '2023' },
    ],
  }),
  emp({
    employeeId: 'EMP-0015', fullName: 'Ratna Sari', gender: 'Female',
    jobPosition: 'Barista', department: 'Operations', jobLevel: 'Staff',
    businessUnit: 'Retail Coffee', employmentStatus: 'Permanent', joinDate: '2021-01-11',
    email: 'ratna.sari@centralperk.co.id', personalEmail: 'ratnasari96@gmail.com', phone: '+62 812-3232-1010', additionalPhone: '+62 813-3232-1011',
    dateOfBirth: '1996-12-20', placeOfBirth: 'Bogor', maritalStatus: 'Single',
    nik: '3271012012960015', npwp: '16.445.667.8-431.000', ptkpStatus: 'TK/0',
    directManager: 'Siti Rahmawati', basicSalary: 7_000_000, overtimeEligible: true,
    bankAccountNumber: '4478990011', bankAccountHolder: 'Ratna Sari',
    bpjsKesehatanNo: '0015234567815', bpjsKetenagakerjaanNo: '21010056789',
    ktpAddress: 'Jl. Pajajaran No. 33, Bogor', currentAddress: 'Jl. Pajajaran No. 33, Bogor',
    emergencyName: 'Kartika', emergencyRelationship: 'Parent', emergencyPhone: '+62 812-7373-8484',
    lastEducation: 'SMA/SMK', major: 'Tata Boga', institution: 'SMK Negeri 3 Bogor',
    status: 'resigned', resignDate: '2026-05-31',
    family: [
      { id: 'fam-0015-1', name: 'Kartika', relationship: 'Parent', birthDate: '1971-05-05', citizenId: '3271010505710033', maritalStatus: 'Widowed', gender: 'Female', occupation: 'Trader', religion: 'Islam', reimbursementEligible: false },
    ],
    emergencyContacts: [
      { id: 'ec-0015-1', name: 'Kartika',    relationship: 'Parent',  phone: '+62 812-7373-8484' },
      { id: 'ec-0015-2', name: 'Bayu Sari',  relationship: 'Sibling', phone: '+62 813-6161-7272' },
    ],
    education: [
      { id: 'edu-0015-1', institution: 'SMK Negeri 3 Bogor', degree: 'Vocational high school', fieldOfStudy: 'Culinary (Tata Boga)', startYear: '2011', endYear: '2014', grade: '8.2 / 10', certificateUrl: '/avatars/jessie.jpg' },
      { id: 'edu-0015-2', institution: 'SMP Negeri 2 Bogor', degree: 'Junior high school',    fieldOfStudy: 'General',               startYear: '2008', endYear: '2011', grade: '—' },
    ],
    workExperience: [
      { id: 'we-0015-1', company: 'Excelso Coffee', position: 'Barista', startYear: '2018', endYear: '2021' },
    ],
  }),
  emp({
    employeeId: 'EMP-0016', fullName: 'Doni Kurniawan', gender: 'Male',
    jobPosition: 'IT Support', department: 'Technology', jobLevel: 'Staff',
    businessUnit: 'Corporate', employmentStatus: 'Contract', joinDate: '2022-11-01',
    email: 'doni.kurniawan@centralperk.co.id', personalEmail: 'donikurniawan94@gmail.com', phone: '+62 811-8484-2323', additionalPhone: '+62 812-8484-2324',
    dateOfBirth: '1994-02-17', placeOfBirth: 'Tangerang', maritalStatus: 'Married',
    nik: '3671011702940016', npwp: '17.556.778.9-451.000', ptkpStatus: 'K/0',
    directManager: 'Rio Firmansyah', basicSalary: 10_500_000,
    bankAccountNumber: '5589001122', bankAccountHolder: 'Doni Kurniawan',
    bpjsKesehatanNo: '0016234567816', bpjsKetenagakerjaanNo: '22110067890',
    ktpAddress: 'Jl. MH Thamrin No. 9, Tangerang', currentAddress: 'Jl. Daan Mogot No. 150, Tangerang',
    emergencyName: 'Fitri Kurniawan', emergencyRelationship: 'Spouse', emergencyPhone: '+62 812-2626-3737',
    lastEducation: 'S1', major: 'Information Systems', institution: 'Universitas Bina Nusantara',
    status: 'resigned', resignDate: '2026-03-15',
    family: [
      { id: 'fam-0016-1', name: 'Fitri Kurniawan', relationship: 'Spouse', birthDate: '1995-08-08', citizenId: '3671010808950034', maritalStatus: 'Married', gender: 'Female', occupation: 'Content Writer', religion: 'Islam', reimbursementEligible: true },
    ],
    emergencyContacts: [
      { id: 'ec-0016-1', name: 'Fitri Kurniawan', relationship: 'Spouse', phone: '+62 812-2626-3737' },
    ],
    education: [
      { id: 'edu-0016-1', institution: 'Universitas Bina Nusantara', degree: "Bachelor's degree (S1)", fieldOfStudy: 'Information Systems', startYear: '2012', endYear: '2016', grade: '3.50 / 4.00', certificateUrl: '/avatars/andi.jpg' },
      { id: 'edu-0016-2', institution: 'SMA Negeri 2 Tangerang',     degree: 'High school',            fieldOfStudy: 'Science',             startYear: '2009', endYear: '2012', grade: '—' },
    ],
    workExperience: [
      { id: 'we-0016-1', company: 'PT Data Sinergitama', position: 'IT Helpdesk', startYear: '2018', endYear: '2022' },
    ],
  }),
]

const KEY = 'employees-v1'
const snap = loadSnapshot<Employee>(KEY)
export const employees = reactive<Employee[]>(snap ?? SEED.map((e) => ({ ...e })))

function persist(): void { saveSnapshot(KEY, employees) }

/** Next EMP-#### code, zero-padded to 4 digits. */
export function nextEmployeeCode(): string {
  const max = employees.reduce((m, e) => {
    const n = Number(e.employeeId.replace(/\D/g, ''))
    return Number.isFinite(n) ? Math.max(m, n) : m
  }, 0)
  return `EMP-${String(max + 1).padStart(4, '0')}`
}

export function getEmployee(id: string): Employee | undefined {
  return employees.find((e) => e.id === id)
}

export function addEmployee(input: Omit<Employee, 'id'> & { id?: string }): Employee {
  const record: Employee = { ...input, id: input.id ?? input.employeeId }
  employees.push(record)
  persist()
  return record
}

export function updateEmployee(id: string, patch: Partial<Employee>): void {
  const e = employees.find((x) => x.id === id)
  if (!e) return
  Object.assign(e, patch)
  persist()
}

export function markResigned(id: string, resignDate: string): void {
  updateEmployee(id, { status: 'resigned', resignDate })
}

export function deleteEmployee(id: string): void {
  const i = employees.findIndex((e) => e.id === id)
  if (i !== -1) { employees.splice(i, 1); persist() }
}

export function deleteFamilyMember(empId: string, famId: string): void {
  const e = getEmployee(empId)
  if (e?.family) { e.family = e.family.filter((f) => f.id !== famId); persist() }
}

export function deleteEmergencyContact(empId: string, ecId: string): void {
  const e = getEmployee(empId)
  if (e?.emergencyContacts) { e.emergencyContacts = e.emergencyContacts.filter((c) => c.id !== ecId); persist() }
}

export function deleteEducation(empId: string, id: string): void {
  const e = getEmployee(empId)
  if (e?.education) { e.education = e.education.filter((x) => x.id !== id); persist() }
}

export function deleteWorkExperience(empId: string, id: string): void {
  const e = getEmployee(empId)
  if (e?.workExperience) { e.workExperience = e.workExperience.filter((x) => x.id !== id); persist() }
}

export function deleteInformalEducation(empId: string, id: string): void {
  const e = getEmployee(empId)
  if (e?.informalEducation) { e.informalEducation = e.informalEducation.filter((x) => x.id !== id); persist() }
}
