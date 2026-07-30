# Библиотеки
import math
from numba import njit
import numpy as np

# Таблицы смертности
DAC = (
    (
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.6915, 0.8085,
        0.9375, 1.0725, 1.2165, 1.3695, 1.5315, 1.7025, 1.872, 2.037, 2.2005,
        2.361, 2.5155, 2.658, 2.787, 2.907, 3.021, 3.138, 3.261, 3.3945,
        3.5475, 3.7245, 3.927, 4.146, 4.3845, 4.6485, 4.941, 5.2635, 5.6085,
        5.9805, 6.384, 6.8295, 7.677, 8.208, 8.7645, 9.354, 9.9855, 10.662,
        11.358, 12.0795, 12.8415, 13.659, 14.5365, 15.456, 16.422, 17.457,
        18.579, 19.7835, 21.0345, 22.335, 23.7195, 25.224, 26.865, 28.6215,
        30.513, 32.5815, 34.857, 37.32, 39.8685, 42.495, 45.2415, 48.1575,
        51.528, 55.1355, 58.995, 63.1245, 67.5435, 72.2715
    ),
    (
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.3225, 0.3555,
        0.3915, 0.4275, 0.4695, 0.5145, 0.564, 0.618, 0.6735, 0.729, 0.7845,
        0.843, 0.9015, 0.9585, 1.0155, 1.0725, 1.131, 1.1925, 1.2555, 1.3215,
        1.392, 1.47, 1.554, 1.644, 1.7415, 1.8465, 1.965, 2.097, 2.241,
        2.3985, 2.574, 2.772, 3.1425, 3.393, 3.663, 3.9555, 4.275, 4.617,
        4.968, 5.3265, 5.7015, 6.105, 6.549, 7.029, 7.5645, 8.172, 8.8725,
        9.672, 10.554, 11.5335, 12.6525, 13.9485, 15.4515, 17.1525, 19.092,
        21.33, 23.9175, 26.856, 30.057, 33.54, 37.383, 41.658, 45.4065,
        49.494, 53.949, 58.803, 64.0965, 69.864
    )
)

TPD = (
    (
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.216, 0.216,
        0.216, 0.216, 0.216, 0.216, 0.216, 0.216, 0.216, 0.216, 0.216, 0.216,
        0.216, 0.2415, 0.273, 0.3135, 0.3585, 0.408, 0.471, 0.5385, 0.6165,
        0.7065, 0.813, 0.9045, 1.0185, 1.146, 1.2885, 1.4415, 1.602, 1.77,
        1.944, 2.1345, 2.457, 2.6865, 2.9325, 3.1875, 3.4515, 3.7215, 4.0065,
        4.3125, 4.6335, 4.986, 5.3685, 5.7795, 6.219, 6.684, 7.1835, 7.7235,
        8.319, 8.9595, 9.6495, 10.392, 11.2545
    ),
    (
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.162, 0.162,
        0.162, 0.162, 0.162, 0.162, 0.162, 0.162, 0.162, 0.162, 0.162, 0.162,
        0.162, 0.183, 0.21, 0.2445, 0.2835, 0.3255, 0.381, 0.441, 0.5115,
        0.5925, 0.6915, 0.7785, 0.8865, 1.008, 1.146, 1.2975, 1.4565, 1.6275,
        1.8075, 2.007, 2.334, 2.58, 2.844, 3.123, 3.417, 3.7215, 4.047,
        4.398, 4.773, 5.1855, 5.637, 6.1275, 6.654, 7.218, 7.83, 8.496,
        9.2265, 10.02, 10.8825, 11.8185, 12.918
    )
)

AD = (
    (
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1.05, 1.05, 1.05,
        1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05,
        1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05,
        1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05,
        1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05,
        1.05, 1.05, 1.05, 1.05, 1.05, 1.05
    ),
    (
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1.05, 1.05, 1.05,
        1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05,
        1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05,
        1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05,
        1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05,
        1.05, 1.05, 1.05, 1.05, 1.05, 1.05
    )
)

TAD = (
    (
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.42, 0.42, 0.42,
        0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42,
        0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42,
        0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42,
        0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42,
        0.42, 0.42, 0.42, 0.42, 0.42, 0.42
    ),
    (
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.42, 0.42, 0.42,
        0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42,
        0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42,
        0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42,
        0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42,
        0.42, 0.42, 0.42, 0.42, 0.42, 0.42
    )
)

Trauma = (
    (
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 40, 40, 40, 40,
        40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40,
        40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40,
        40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40
    ),
    (
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 40, 40, 40, 40,
        40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40,
        40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40,
        40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40
    )
)

TPD_2_ill = (
    (
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.078, 0.078,
        0.078, 0.077, 0.076, 0.074, 0.073, 0.071, 0.068, 0.064, 0.057, 0.049,
        0.038, 0.0495, 0.064, 0.0825, 0.1025, 0.125, 0.153, 0.1845, 0.2195,
        0.2605, 0.309, 0.3505, 0.4015, 0.46, 0.5245, 0.5935, 0.666, 0.742,
        0.821, 0.9075, 1.054, 1.1575, 1.2695, 1.3855, 1.5045, 1.6275, 1.7565,
        1.8945, 2.0405, 2.2, 2.3735, 2.5595, 2.759, 2.97, 3.1965, 3.4415,
        3.711, 4.0015, 4.3145, 4.651, 5.0425
    ),
    (
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.046, 0.046,
        0.046, 0.046, 0.044, 0.044, 0.042, 0.04, 0.038, 0.035, 0.029, 0.022,
        0.014, 0.023, 0.035, 0.0505, 0.0685, 0.0875, 0.113, 0.14, 0.1715,
        0.2085, 0.2535, 0.2925, 0.3415, 0.397, 0.46, 0.5285, 0.6005, 0.6775,
        0.7595, 0.85, 0.998, 1.11, 1.229, 1.356, 1.489, 1.6275, 1.775,
        1.934, 2.104, 2.2905, 2.495, 2.7175, 2.956, 3.212, 3.49, 3.792,
        4.1225, 4.482, 4.8735, 5.2975, 5.796
    )
)

@njit('float64(int64, float64[:], int64)')
def it(t, rates_table, step = 1):
    len_array = len(rates_table)


    if np.int32(t / step)>=len_array:

        return 1/0
    if len_array==1:
        return (1 + rates_table[0]) ** (1 / step)-1
    else:
        t_int = np.int32(t / step)
        coef = 1 + rates_table[t_int]
        return coef ** (1 / step)-1


@njit('float64(int64, float64[:], int64)')
def vt(t, rates_table, step = 1):

    return 1 / (1 + it(max(0,t), rates_table, step)) #Тут было (t-step) вместо max(0,t), не очень поняла зачем вычитаем step + в экселе такого нет!


@njit('float64(int64, int64, float64[:], int64)')
def vn_t(t, n, rates_table, step = 1):
    temp = 1
    if n < 0:
        return 1
    for k in list(range(0, n)):
        temp = temp * vt(t+k, rates_table, step)
    return temp

@njit('float64(int64, int64, float64[:, :], float64, float64, int64)')
def px_tb_qx(x, gender, tb_qx, otn, abs, step):
    len_array = len(tb_qx)
    if int(x / step) + 1 >= len_array:
        return 1.0
    if len_array == 1:
        return (1-(tb_qx[0,0] * (1 + otn) + abs))**(1/step)
    elif tb_qx[int(x / step), gender - 1] == 1:
        return 0.0
    elif x >= 0:
        return (1-(tb_qx[int(x / step), gender - 1] * (1 + otn) + abs))**(1/step)
    elif x < 0:
        return 1.0
    else:
        return 1.0

@njit('float64(int64, int64, float64[:, :], float64, float64, int64, int64)') # БЕЗ ИЗМЕНЕНИЙ
def qx_tb_qx(x, gender, tb_qx, otn = 0, abs = 0, step = 1, uw = 0):
    if (uw > 10):
        return (1 - px_tb_qx(x, gender, tb_qx, otn, abs, step)) * (1 + uw / 100)
    else:
        return (1 - px_tb_qx(x, gender, tb_qx, otn, abs, step)) + uw / 1000

@njit('float64(int64, int64, int64, float64[:, :], float64, float64, int64, int64)')
def npx_tb_qx(n, x, gender, tb_qx, otn = 0, abs = 0, step = 1, uw = 0):
    if n <= 0:
        return 1
    len_array = len(tb_qx)

    if len_array > 1:
        if tb_qx[int(x / step), gender - 1] == 1:
            return 0
        elif int(x / step) + 1 >= len_array:
            return 1.0
    return npx_tb_qx(n - 1, x, gender, tb_qx, otn, abs, step, uw) * \
           (1 - qx_tb_qx(x + n - 1, gender, tb_qx, otn, abs, step, uw))

@njit('float64(int64, int64, int64, int64, float64[:], float64[:, :], float64, float64, int64, int64)')
def nEx_t_tb_qx(t, n, x, gender, rates_table, tb_qx, otn = 0, abs = 0, step = 1, uw = 0):
    if n < 0:
        return 1
    else:
        return npx_tb_qx(n, x, gender, tb_qx, otn, abs, step, uw) * vn_t(t, n, rates_table, step)


@njit('float64(int64, int64, int64, int64, float64[:], float64[:, :], float64, float64, int64, int64, int64)')
def axn_t_pren_tb_qx(t, n , x , gender , rates_table , tb_qx, otn = 0, abs = 0, step = 1, uw = 0, periodicity = 1):
    temp = 0
    nEx_t_st = 1
    for k in list(range(0, n)):
        if k % (12 / periodicity) == 0: # из-за поправки на периодичность работает только со step = 12 (в годах рез-тат некорректный - в макросе то же)
            temp += nEx_t_st / step
        nEx_t_st *= nEx_t_tb_qx(t + k, 1, x + k, gender, rates_table, tb_qx, otn, abs, step, uw)
    return temp


@njit('float64(int64, int64, int64, int64, float64[:], float64[:, :], float64, float64, int64, int64)')
def Ax1n_t_tb_qx(t, n , x , gender , rates_table , tb_qx, otn = 0, abs = 0, step = 1, uw = 0):
    temp = 0
    nEx_t_st = 1
    for k in list(range(1, n+1)):
        temp += nEx_t_st * qx_tb_qx(x + k - 1, gender, tb_qx, otn, abs, step, uw) * vt(t + k - 1, rates_table, step)
        nEx_t_st *= nEx_t_tb_qx(t + k - 1, 1, x + k - 1, gender, rates_table, tb_qx, otn, abs, step, uw)
    return temp

@njit('float64(int64, int64, int64, int64, float64[:], float64[:, :], float64[:, :], float64, float64, int64, int64)')
def Ax_2table_1n_t_tb_qx(t, n, x, gender, rates_table, tb_qx, dsb_tb, otn = 0.0, abs = 0.0, step = 1, uw = 0):
    temp = 0
    nEx_t_st = 1

    for k in list(range(1, n+1)):
            temp += nEx_t_st * qx_tb_qx(x + k - 1, gender, dsb_tb, otn, abs, step, uw) * vt(t + k - 1, rates_table, step=step)
            nEx_t_st *= nEx_t_tb_qx(t + k - 1, 1, x + k - 1, gender, rates_table, tb_qx, otn, abs, step, uw)
    return temp


@njit('float64(int64, int64, int64, float64[:, :], float64[:, :], float64, float64, int64, int64)')
def npx_TPD_tb_qx(n, x, gender, tb_qx, dsb_tb, otn = 0, abs = 0, step = 1, uw = 0):
    if n <= 0:
        return 1
    len_array = min(len(tb_qx), len(dsb_tb))

    if len_array > 1:
        if tb_qx[int(x / step), gender - 1] == 1:
            return 0
        elif int(x / step) + 1 >= len_array:
            return 1.0

    result = (1 - qx_tb_qx(x + n - 1, gender, tb_qx, otn, abs, step, uw) - \
            qx_tb_qx(x + n - 1, gender, dsb_tb, otn, abs, step, uw) + \
            qx_tb_qx(x + n - 1, gender, tb_qx, otn, abs, step, uw) * \
            qx_tb_qx(x + n - 1, gender, dsb_tb, otn, abs, step, uw))
    return (npx_TPD_tb_qx(n - 1, x, gender, tb_qx, dsb_tb, otn, abs, step, uw) * result)



@njit('float64(int64, int64, int64, int64, float64[:], float64[:, :], float64[:, :], float64, float64, int64, int64)')
def nEx_t_TPD_tb_qx(t, n, x, gender, rates_table, tb_qx, dsb_tb, otn = 0, abs = 0, step = 1, uw = 0):
    if n < 0:
        return 1
    else:
        return npx_TPD_tb_qx(n, x, gender, tb_qx, dsb_tb, otn, abs, step, uw) * vn_t(t, n, rates_table, step)

@njit('float64(int64, int64, int64, int64, float64[:], float64[:, :], float64[:, :], float64, float64, int64, int64, int64)')
def axn_t_pren_TPD_tb_qx(t, n , x , gender , rates_table , tb_qx, dsb_tb, otn = 0, abs = 0, step = 1, uw = 0, periodicity = 1):
    temp = 0
    nEx_t_st = 1
    for k in list(range(0, n)):
        if k % (12 / periodicity) == 0: # из-за поправки на периодичность работает только со step = 12 (в годах рез-тат некорректный - в макросе то же)
            temp += nEx_t_st / step
        nEx_t_st *= nEx_t_TPD_tb_qx(t + k, 1, x + k, gender, rates_table, tb_qx, dsb_tb, otn, abs, step, uw)
    return temp

@njit('float64(int64, int64, int64, int64, float64[:], float64[:, :], float64[:, :], float64, float64, int64, int64)')
def Ax_2table_TPD_tb_qx(t, n, x, gender, rates_table, tb_qx, dsb_tb, otn = 0.0, abs = 0.0, step = 1, uw = 0):
    temp = 0
    nEx_t_st = 1

    for k in list(range(1, n+1)):
            temp += nEx_t_st * qx_tb_qx(x + k - 1, gender, dsb_tb, otn, abs, step, uw) * vt(t + k - 1, rates_table, step=step)

            nEx_t_st *= nEx_t_TPD_tb_qx(t + k - 1, 1, x + k - 1, gender, rates_table, tb_qx, dsb_tb, otn, abs, step, uw)

    return temp


#----------------------------------------------------------------------------------------------------------------------------------------------------------------------

# Входные данные
print("Введите пол (М - 1, Ж - 2): ")
gender = 1 #input()
print("Введите возраст застрахованного: ")
age = 54 #input()
print("Введите срок страхования (лет): ")
years = 6 #input()
print("Введите СС по риску Смерть ЛП: ")
SS = 650455 #input()
print("Покрытие занятий экстремальными видами спорта (ДА - 1, НЕТ - 2): ")
sport = 2 #input()


# Предположения
i_year = 0.03
i_month = (1+i_year)**(1/12)-1
i_load_main = 0.15
i_load_dop = 0.30
SS_Trauma = 0.3
k_12 = 1.06
loss_Trauma = 0.07


MONTH = (np.arange(365)).astype(int)
YEAR = (np.trunc(MONTH / 12)).astype(int)
AGES = (np.trunc(YEAR) + age - 1).astype(int)

print("\nРасчёт ежегодных тарифов актуарными формулами:")
tariff_DAC = Ax1n_t_tb_qx(0, years*12, (age-1)*12, gender, np.full(years, i_year), np.transpose(np.array(DAC) * 1/1000), 0,0,12,0)/axn_t_pren_tb_qx(0, years, (age-1), gender, np.full(years, i_year), np.transpose(np.array(DAC) * 1/1000), 0,0,1,0, 12)/(1-i_load_main)
tariff_AD = Ax_2table_1n_t_tb_qx(0, years*12, (age-1)*12, gender, np.full(years, i_year), np.transpose(np.array(DAC) * 1/1000), np.transpose(np.array(AD) * 1/1000), 0,0,12,0)/axn_t_pren_tb_qx(0, years, (age-1), gender, np.full(years, i_year), np.transpose(np.array(DAC) * 1/1000), 0,0,1,0, 12)/(1-i_load_dop)
tariff_TAD = Ax_2table_1n_t_tb_qx(0, years*12, (age-1)*12, gender, np.full(years, i_year), np.transpose(np.array(DAC) * 1/1000), np.transpose(np.array(TAD) * 1/1000), 0,0,12,0)/axn_t_pren_tb_qx(0, years, (age-1), gender, np.full(years, i_year), np.transpose(np.array(DAC) * 1/1000), 0,0,1,0, 12)/(1-i_load_dop)
tariff_TPD = Ax_2table_TPD_tb_qx(0, years*12, (age-1)*12, gender, np.full(years, i_year), np.transpose(np.array(DAC) * 1/1000), np.transpose(np.array(TPD) * 1/1000), 0,0,12,0) / axn_t_pren_TPD_tb_qx(0, years, (age-1), gender, np.full(years, i_year), np.transpose(np.array(DAC) * 1/1000), np.transpose(np.array(TPD) * 1/1000), 0,0,1,0, 12)/(1-i_load_dop)
tariff_TRAUMA = SS_Trauma * loss_Trauma * Ax_2table_1n_t_tb_qx(0, years*12, (age-1)*12, gender, np.full(years, i_year), np.transpose(np.array(DAC) * 1/1000), np.transpose(np.array(Trauma) * 1/1000), 0,0,12,0)/axn_t_pren_tb_qx(0, years, (age-1), gender, np.full(years, i_year), np.transpose(np.array(DAC) * 1/1000), 0,0,1,0, 12)/(1-i_load_dop)
tariff_all_1 = tariff_DAC + tariff_AD + tariff_TAD + tariff_TPD + tariff_TRAUMA

prem_all_1 = math.ceil(SS * tariff_all_1 * (1.4 if sport == 1 else 1) / 5) * 5
prem_DAC_1 = round(prem_all_1 * tariff_DAC/tariff_all_1, 0)
prem_AD_1 = round(prem_all_1 * tariff_AD/tariff_all_1, 0)
prem_TAD_1 = round(prem_all_1 * tariff_TAD/tariff_all_1, 0)
prem_TPD_1 = round(prem_all_1 * tariff_TPD/tariff_all_1, 0)
prem_Trauma_1 = prem_all_1 - prem_DAC_1 - prem_AD_1 - prem_TAD_1 - prem_TPD_1
print("ежегодно:")
print("вся премия (в год): ", prem_all_1)
print("tariff_all_1: ", tariff_all_1 * (1.4 if sport == 1 else 1))
print("ежегодно премии по рискам: ", prem_DAC_1, prem_AD_1, prem_TAD_1, prem_TPD_1, prem_Trauma_1)
print("страховые суммы: ", round(SS / 5) * 5, round(SS * SS_Trauma / 5) * 5)


print("\nРасчёт ежемесячных тарифов актуарными формулами:")
tariff_DAC = Ax1n_t_tb_qx(0, years*12, (age-1)*12, gender, np.full(years, i_year), np.transpose(np.array(DAC) * 1/1000), 0,0,12,0)/axn_t_pren_tb_qx(0, years*12, (age-1)*12, gender, np.full(years, i_year), np.transpose(np.array(DAC) * 1/1000), 0,0,12,0, 12)/(1-i_load_main) * k_12
tariff_AD = Ax_2table_1n_t_tb_qx(0, years*12, (age-1)*12, gender, np.full(years, i_year), np.transpose(np.array(DAC) * 1/1000), np.transpose(np.array(AD) * 1/1000), 0,0,12,0)/axn_t_pren_tb_qx(0, years*12, (age-1)*12, gender, np.full(years, i_year), np.transpose(np.array(DAC) * 1/1000), 0,0,12,0, 12)/(1-i_load_dop) * k_12
tariff_TAD = Ax_2table_1n_t_tb_qx(0, years*12, (age-1)*12, gender, np.full(years, i_year), np.transpose(np.array(DAC) * 1/1000), np.transpose(np.array(TAD) * 1/1000), 0,0,12,0)/axn_t_pren_tb_qx(0, years*12, (age-1)*12, gender, np.full(years, i_year), np.transpose(np.array(DAC) * 1/1000), 0,0,12,0, 12)/(1-i_load_dop) * k_12
tariff_TPD = Ax_2table_TPD_tb_qx(0, years*12, (age-1)*12, gender, np.full(years, i_year), np.transpose(np.array(DAC) * 1/1000), np.transpose(np.array(TPD) * 1/1000), 0,0,12,0)/axn_t_pren_TPD_tb_qx(0, years*12, (age-1)*12, gender, np.full(years, i_year), np.transpose(np.array(DAC) * 1/1000), np.transpose(np.array(TPD) * 1/1000), 0,0,12,0, 12)/(1-i_load_dop) * k_12
tariff_TRAUMA = SS_Trauma * loss_Trauma * Ax_2table_1n_t_tb_qx(0, years*12, (age-1)*12, gender, np.full(years, i_year), np.transpose(np.array(DAC) * 1/1000), np.transpose(np.array(Trauma) * 1/1000), 0,0,12,0)/axn_t_pren_tb_qx(0, years*12, (age-1)*12, gender, np.full(years, i_year), np.transpose(np.array(DAC) * 1/1000), 0,0,12,0, 12)/(1-i_load_dop) * k_12
tariff_all_12 = tariff_DAC + tariff_AD + tariff_TAD + tariff_TPD + tariff_TRAUMA

prem_all_12 = math.ceil(SS * tariff_all_12 * (1.4 if sport == 1 else 1) * 1/12 / 5) * 5
prem_DAC_12 = round(prem_all_12 * tariff_DAC/tariff_all_12, 0)
prem_AD_12 = round(prem_all_12 * tariff_AD/tariff_all_12, 0)
prem_TAD_12 = round(prem_all_12 * tariff_TAD/tariff_all_12, 0)
prem_TPD_12 = round(prem_all_12 * tariff_TPD/tariff_all_12, 0)
prem_Trauma_12 = prem_all_12 - prem_DAC_12 - prem_AD_12 - prem_TAD_12 - prem_TPD_12
print("ежемесячно:")
print("вся премия (в месяц): ", prem_all_12)
print("tariff_all_12: ", tariff_all_12 * (1.4 if sport == 1 else 1))
print("ежемесячно премии по рискам: ", prem_DAC_12, prem_AD_12, prem_TAD_12, prem_TPD_12, prem_Trauma_12)
print("страховые суммы: ", round(SS / 5) * 5, round(SS * SS_Trauma / 5) * 5)