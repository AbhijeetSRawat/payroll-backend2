// Indian Payroll & Tax Rules (FY 2025-26, AY 2026-27)
// Functions return annual figures in INR

function roundToNearestRupee(value) {
    return Math.round(value);
}

function computeGross({ basic_salary, da = 0, hra_received = 0, other_allowances = 0 }) {
    // Convert monthly values to annual - ensure proper number conversion
    const basic = parseFloat(basic_salary) || 0;
    const daValue = parseFloat(da) || 0;
    const hra = parseFloat(hra_received) || 0;
    const allowances = parseFloat(other_allowances) || 0;
    
    console.log('computeGross inputs:', { basic_salary, da, hra_received, other_allowances });
    console.log('Parsed values:', { basic, daValue, hra, allowances });
    
    const monthlyGross = basic + daValue + hra + allowances;
    const annualGross = monthlyGross * 12;
    
    console.log('Monthly gross:', monthlyGross, 'Annual gross:', annualGross);
    
    return roundToNearestRupee(annualGross);
}

function computePF(basic_salary, da) {
    // Convert monthly values to annual for PF calculation - ensure proper number conversion
    const basic = parseFloat(basic_salary) || 0;
    const daValue = parseFloat(da) || 0;
    const monthlyWage = basic + daValue;
    const annualWage = monthlyWage * 12;
    const wage = Math.min(annualWage, 15000 * 12); // annual cap
    const employee = roundToNearestRupee(0.12 * wage);
    const employer_total = 0.12 * wage;
    const eps = roundToNearestRupee(0.0833 * wage);
    const epf = roundToNearestRupee(employer_total - (0.0833 * wage));
    return { employee, employer: { eps, epf } };
}

function computeESIC(gross) {
    if (gross <= 21000 * 12) {
        return {
            employee: roundToNearestRupee(0.0075 * gross),
            employer: roundToNearestRupee(0.0325 * gross),
        };
    }
    return { employee: 0, employer: 0 };
}

function computeHraExemption({ basic_salary, da = 0, hra_received = 0, rent_paid = 0, city = 'Non-Metro' }) {
    // Convert monthly values to annual for HRA calculation - ensure proper number conversion
    const basic = parseFloat(basic_salary) || 0;
    const daValue = parseFloat(da) || 0;
    const hra = parseFloat(hra_received) || 0;
    const rent = parseFloat(rent_paid) || 0;
    
    const monthlySalaryForHra = basic + daValue;
    const annualSalaryForHra = monthlySalaryForHra * 12;
    const annualHraReceived = hra * 12;
    const annualRentPaid = rent * 12;
    
    const tenPercentSalary = 0.10 * annualSalaryForHra;
    const rentMinusTenPercent = Math.max(0, annualRentPaid - tenPercentSalary);
    const percentOfSalary = (city === 'Metro' ? 0.50 : 0.40) * annualSalaryForHra;
    const minExemption = Math.min(annualHraReceived, rentMinusTenPercent, percentOfSalary);
    return roundToNearestRupee(Math.max(0, minExemption));
}

function oldRegimeTaxableIncome({ gross, standardDeduction = 50000, deductions = {}, hraExemption = 0, pfEmployee = 0, esicEmployee = 0 }) {
    const totalDeductions = (standardDeduction || 0) + (pfEmployee || 0) + (esicEmployee || 0) + Object.values(deductions || {}).reduce((a, b) => a + (b || 0), 0) + (hraExemption || 0);
    return Math.max(0, roundToNearestRupee(gross - totalDeductions));
}

function newRegimeTaxableIncome({ gross, standardDeduction = 75000, pfEmployee = 0, esicEmployee = 0, deductions = {} }) {
    // New regime generally does not allow most 80C deductions. We ignore 80C et al here.
    const totalDeductions = (standardDeduction || 0) + (pfEmployee || 0) + (esicEmployee || 0);
    return Math.max(0, roundToNearestRupee(gross - totalDeductions));
}

function computeOldRegimeTax(income) {
    // Old regime slabs (assumed unchanged for FY 2025-26). Update if notified.
    let tax = 0;
    let remaining = income;

    const slabs = [
        { upTo: 250000, rate: 0 },
        { upTo: 500000, rate: 0.05 },
        { upTo: 1000000, rate: 0.20 },
        { upTo: Infinity, rate: 0.30 },
    ];

    let previous = 0;
    for (const slab of slabs) {
        const taxable = Math.max(0, Math.min(remaining, slab.upTo - previous));
        tax += taxable * slab.rate;
        remaining -= taxable;
        previous = slab.upTo;
        if (remaining <= 0) break;
    }

    // 87A rebate for income up to 5L
    if (income <= 500000) tax = 0;

    return roundToNearestRupee(tax);
}

function computeNewRegimeTaxFY2025(income) {
    // New regime slabs FY 2025-26 (post Budget 2024 changes):
    // 0-4L: 0%, 4-8L: 5%, 8-12L: 10%, 12-16L: 15%, 16-20L: 20%, 20L+: 30%
    const slabs = [
        { upTo: 400000, rate: 0 },
        { upTo: 800000, rate: 0.05 },
        { upTo: 1200000, rate: 0.10 },
        { upTo: 1600000, rate: 0.15 },
        { upTo: 2000000, rate: 0.20 },
        { upTo: Infinity, rate: 0.30 },
    ];

    let tax = 0;
    let previous = 0;
    let remaining = income;
    for (const slab of slabs) {
        const taxable = Math.max(0, Math.min(remaining, slab.upTo - previous));
        tax += taxable * slab.rate;
        remaining -= taxable;
        previous = slab.upTo;
        if (remaining <= 0) break;
    }

    // Rebate: up to ₹60,000 if income ≤ 12L
    if (income <= 1200000) {
        tax = Math.max(0, tax - 60000);
    }

    return roundToNearestRupee(tax);
}

function addCess(tax) {
    return roundToNearestRupee(tax * 0.04);
}

function computePayroll(input) {
    const gross_salary = computeGross(input);
    const pf = computePF(input.basic_salary, input.da);
    const esic = computeESIC(gross_salary);
    const hra_exemption = computeHraExemption(input);

    const taxable_income_old = oldRegimeTaxableIncome({
        gross: gross_salary + (input.other_income || 0),
        standardDeduction: 50000,
        deductions: input.deductions || {},
        hraExemption: hra_exemption,
        pfEmployee: pf.employee,
        esicEmployee: esic.employee,
    });

    const taxable_income_new = newRegimeTaxableIncome({
        gross: gross_salary + (input.other_income || 0),
        standardDeduction: 75000,
        pfEmployee: pf.employee,
        esicEmployee: esic.employee,
        deductions: {},
    });

    const tax_old = computeOldRegimeTax(taxable_income_old);
    const tax_new = computeNewRegimeTaxFY2025(taxable_income_new);
    const cess_old = addCess(tax_old);
    const cess_new = addCess(tax_new);
    const total_tax_old = roundToNearestRupee(tax_old + cess_old);
    const total_tax_new = roundToNearestRupee(tax_new + cess_new);

    const recommendation = total_tax_old <= total_tax_new ? 'Old Regime is better' : 'New Regime is better';

    const chosenTax = recommendation === 'Old Regime is better' ? total_tax_old : total_tax_new;
    const net_take_home = roundToNearestRupee(
        gross_salary - pf.employee - esic.employee - chosenTax
    );

    return {
        gross_salary,
        pf_employee: pf.employee,
        pf_employer: pf.employer,
        esic,
        hra_exemption,
        taxable_income_old,
        taxable_income_new,
        tax_old,
        tax_new,
        cess_old,
        cess_new,
        total_tax_old,
        total_tax_new,
        recommendation,
        net_take_home,
    };
}

export {
    computePayroll,
    computeGross,
    computePF,
    computeESIC,
    computeHraExemption,
};
